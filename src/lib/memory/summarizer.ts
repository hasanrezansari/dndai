import { desc, eq, and } from "drizzle-orm";

import type { AIProvider } from "@/lib/ai/types";
import { db } from "@/lib/db";
import { memorySummaries, narrativeEvents } from "@/lib/db/schema";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import { MemorySummaryOutputSchema } from "@/lib/schemas/ai-io";

import type { RollingSummaryContent } from "./types";

const SUMMARIZE_CADENCE = 4;

const SUMMARIZER_SYSTEM = `You are the memory summarizer for Ashveil, a dark fantasy RPG. Compress recent narrative events into a structured summary that preserves key facts.

Output JSON:
- "summary_type": always "rolling"
- "turn_range_start": first turn number covered
- "turn_range_end": last turn number covered
- "content": {
    "key_events": ["array of 3-6 most important events that happened"],
    "active_hooks": ["unresolved plot threads, quests, mysteries"],
    "npc_relationships": ["NPC name: current attitude/status toward party"],
    "world_changes": ["environmental or world-state changes"]
  }

Rules:
- Preserve FACTS, not prose style
- Keep each entry concise (under 20 words)
- Merge with previous summary context if provided
- Prioritize information the narrator needs for coherent storytelling`;

export async function shouldSummarize(
  sessionId: string,
  currentRound: number,
): Promise<boolean> {
  const [latest] = await db
    .select({ turn_range_end: memorySummaries.turn_range_end })
    .from(memorySummaries)
    .where(
      and(
        eq(memorySummaries.session_id, sessionId),
        eq(memorySummaries.summary_type, "rolling"),
      ),
    )
    .orderBy(desc(memorySummaries.created_at))
    .limit(1);

  const lastSummarizedRound = latest?.turn_range_end ?? 0;
  return currentRound - lastSummarizedRound >= SUMMARIZE_CADENCE;
}

export async function runSummarizer(params: {
  sessionId: string;
  currentRound: number;
  provider: AIProvider;
}): Promise<void> {
  const { sessionId, currentRound, provider } = params;

  const [latestSummary] = await db
    .select()
    .from(memorySummaries)
    .where(
      and(
        eq(memorySummaries.session_id, sessionId),
        eq(memorySummaries.summary_type, "rolling"),
      ),
    )
    .orderBy(desc(memorySummaries.created_at))
    .limit(1);

  const lastEnd = latestSummary?.turn_range_end ?? 0;

  const recentRows = await db
    .select({
      scene_text: narrativeEvents.scene_text,
      tone: narrativeEvents.tone,
      visible_changes: narrativeEvents.visible_changes,
      created_at: narrativeEvents.created_at,
    })
    .from(narrativeEvents)
    .where(eq(narrativeEvents.session_id, sessionId))
    .orderBy(desc(narrativeEvents.created_at))
    .limit(12);

  const recentTexts = recentRows
    .reverse()
    .map((r) => {
      const changes = Array.isArray(r.visible_changes) && r.visible_changes.length > 0
        ? ` [Changes: ${r.visible_changes.join(", ")}]`
        : "";
      return `[${r.tone}] ${r.scene_text}${changes}`;
    })
    .join("\n---\n");

  const previousContext = latestSummary
    ? JSON.stringify(latestSummary.content)
    : "No previous summary";

  const userPrompt = JSON.stringify({
    previous_summary: previousContext,
    recent_narratives: recentTexts.slice(0, 4000),
    turn_range_start: lastEnd + 1,
    turn_range_end: currentRound,
  });

  const fallback = () => ({
    summary_type: "rolling" as const,
    turn_range_start: lastEnd + 1,
    turn_range_end: currentRound,
    content: {
      key_events: ["Summary generation skipped — using raw recent events"],
      active_hooks: [],
      npc_relationships: [],
      world_changes: [],
    } as Record<string, unknown>,
  });

  const result = await runOrchestrationStep({
    stepName: "memory_summarizer",
    sessionId,
    turnId: null,
    provider,
    model: "light",
    systemPrompt: SUMMARIZER_SYSTEM,
    userPrompt,
    schema: MemorySummaryOutputSchema,
    maxTokens: 600,
    temperature: 0.3,
    fallback,
    timeoutMs: 15_000,
  });

  const content = result.data.content as unknown as RollingSummaryContent;

  await db.insert(memorySummaries).values({
    session_id: sessionId,
    summary_type: "rolling",
    content: content as unknown as Record<string, unknown>,
    turn_range_start: lastEnd + 1,
    turn_range_end: currentRound,
  });
}
