import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { isCustomClassesEnabled } from "@/lib/config/features";
import {
  characters,
  memorySummaries,
  narrativeEvents,
  npcStates,
  players,
  sceneSnapshots,
  sessions,
} from "@/lib/db/schema";
import { questProgressForModel } from "@/lib/quest-display";
import { ClassProfileSchema } from "@/lib/schemas/domain";
import { fetchBetrayalFactLines } from "@/server/services/betrayal-service";
import { getQuestState } from "@/server/services/quest-service";

import {
  STYLE_POLICY,
  TOKEN_BUDGET,
  type MemoryBundle,
  type RollingSummaryContent,
} from "./types";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToTokenBudget(text: string, budget: number): string {
  const maxChars = budget * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + "...";
}

async function buildCanonicalState(sessionId: string): Promise<string> {
  const customClassesEnabled = isCustomClassesEnabled();
  const [sess] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sess) return "Session not found";

  const playerRows = await db
    .select()
    .from(players)
    .where(eq(players.session_id, sessionId))
    .orderBy(asc(players.seat_index));

  const charParts: string[] = [];
  for (const p of playerRows) {
    const [c] = await db
      .select()
      .from(characters)
      .where(eq(characters.player_id, p.id))
      .limit(1);
    if (c) {
      const conditions = Array.isArray(c.conditions) && c.conditions.length > 0
        ? ` [${c.conditions.join(", ")}]`
        : "";
      const vp = (c.visual_profile ?? {}) as Record<string, unknown>;
      const parsedProfile = ClassProfileSchema.safeParse(vp.class_profile);
      const classLabel =
        customClassesEnabled && parsedProfile.success
          ? parsedProfile.data.display_name
          : `${c.race} ${c.class}`;
      charParts.push(
        `${c.name} (${classLabel}, HP ${c.hp}/${c.max_hp}, Mana ${c.mana}/${c.max_mana}${conditions})`,
      );
    }
  }

  const npcs = await db
    .select()
    .from(npcStates)
    .where(eq(npcStates.session_id, sessionId));
  const npcParts = npcs.map(
    (n) => `${n.name} (${n.role}, ${n.attitude}, ${n.status}, at ${n.location})`,
  );

  const quest = await getQuestState(sessionId);
  const questLine = quest ? questProgressForModel(quest) : "";
  const betrayalFacts =
    sess.game_kind === "campaign"
      ? await fetchBetrayalFactLines(sessionId, 5)
      : [];
  const betrayalBlock =
    betrayalFacts.length > 0
      ? `Betrayal facts (server): ${betrayalFacts.join(" | ")}`
      : "";

  const worldSummary = typeof sess.world_summary === "string" ? sess.world_summary : "";
  const worldBible =
    typeof sess.world_bible === "string" && sess.world_bible.trim().length > 0
      ? sess.world_bible.trim()
      : "";

  const parts = [
    `Round ${sess.current_round} | Phase: ${sess.phase} | Mode: ${sess.mode}`,
    sess.campaign_title ? `Campaign: ${sess.campaign_title}` : "",
    worldSummary ? `World: ${worldSummary}` : "",
    worldBible ? `Premise (host): ${worldBible}` : "",
    `Party: ${charParts.join("; ") || "none"}`,
    npcParts.length > 0 ? `NPCs: ${npcParts.join("; ")}` : "",
    questLine,
    betrayalBlock,
  ].filter(Boolean);

  return truncateToTokenBudget(parts.join("\n"), TOKEN_BUDGET.canonicalState);
}

/** Last narrator-committed situation line (location + circumstance) for the next turn. */
export async function fetchLatestSituationAnchor(sessionId: string): Promise<string | null> {
  const [row] = await db
    .select({ situation_anchor: narrativeEvents.situation_anchor })
    .from(narrativeEvents)
    .where(eq(narrativeEvents.session_id, sessionId))
    .orderBy(desc(narrativeEvents.created_at))
    .limit(1);
  const a = typeof row?.situation_anchor === "string" ? row.situation_anchor.trim() : "";
  return a.length >= 8 ? a : null;
}

async function buildRecentEventWindow(sessionId: string): Promise<string> {
  const rows = await db
    .select({ scene_text: narrativeEvents.scene_text })
    .from(narrativeEvents)
    .where(eq(narrativeEvents.session_id, sessionId))
    .orderBy(desc(narrativeEvents.created_at))
    .limit(8);

  const texts = rows.map((r) => r.scene_text).reverse();
  const joined = texts.join("\n---\n");
  return truncateToTokenBudget(joined, TOKEN_BUDGET.recentEventWindow);
}

async function buildRollingSummary(sessionId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(memorySummaries)
    .where(eq(memorySummaries.session_id, sessionId))
    .orderBy(desc(memorySummaries.created_at))
    .limit(1);

  if (!row || row.summary_type === "quest_state_v1") {
    const [rolling] = await db
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
    if (!rolling) return null;
    const content = rolling.content as unknown as RollingSummaryContent;
    return formatRollingSummary(content);
  }

  if (row.summary_type === "rolling") {
    const content = row.content as unknown as RollingSummaryContent;
    return formatRollingSummary(content);
  }

  return null;
}

function formatRollingSummary(content: RollingSummaryContent): string {
  const parts: string[] = [];
  if (content.key_events?.length) {
    parts.push(`Key events: ${content.key_events.join("; ")}`);
  }
  if (content.active_hooks?.length) {
    parts.push(`Active hooks: ${content.active_hooks.join("; ")}`);
  }
  if (content.npc_relationships?.length) {
    parts.push(`NPC relations: ${content.npc_relationships.join("; ")}`);
  }
  if (content.world_changes?.length) {
    parts.push(`World changes: ${content.world_changes.join("; ")}`);
  }
  const text = parts.join("\n");
  return truncateToTokenBudget(text, TOKEN_BUDGET.rollingSummary);
}

async function buildVisualBible(sessionId: string): Promise<string | null> {
  const [snap] = await db
    .select({ image_prompt: sceneSnapshots.image_prompt })
    .from(sceneSnapshots)
    .where(eq(sceneSnapshots.session_id, sessionId))
    .orderBy(desc(sceneSnapshots.created_at))
    .limit(1);

  if (!snap?.image_prompt) return null;

  const charRows = await db
    .select({ visual_profile: characters.visual_profile, name: characters.name })
    .from(characters)
    .innerJoin(players, eq(players.id, characters.player_id))
    .where(eq(players.session_id, sessionId));

  const charVisuals = charRows
    .map((r) => {
      const vp = (r.visual_profile ?? {}) as Record<string, unknown>;
      const traits = Array.isArray(vp.traits) ? vp.traits.join(", ") : "";
      return traits ? `${r.name}: ${traits}` : "";
    })
    .filter(Boolean);

  const parts = [
    `Last scene style: ${snap.image_prompt.slice(0, 300)}`,
    charVisuals.length > 0 ? `Character visuals: ${charVisuals.join("; ")}` : "",
  ].filter(Boolean);

  return truncateToTokenBudget(parts.join("\n"), TOKEN_BUDGET.visualBible);
}

async function resolveStylePolicy(sessionId: string): Promise<string> {
  const [sess] = await db
    .select({ style_policy: sessions.style_policy })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const custom = typeof sess?.style_policy === "string" && sess.style_policy.trim();
  return custom ? `${STYLE_POLICY}\n${sess!.style_policy}` : STYLE_POLICY;
}

export async function buildMemoryBundle(
  workerName: string,
  sessionId: string,
): Promise<MemoryBundle> {
  const [canonicalState, recentEventWindow, rollingSummary, visualBible, stylePolicy] =
    await Promise.all([
      buildCanonicalState(sessionId),
      buildRecentEventWindow(sessionId),
      buildRollingSummary(sessionId),
      workerName === "narrator" || workerName === "visual_delta"
        ? buildVisualBible(sessionId)
        : Promise.resolve(null),
      resolveStylePolicy(sessionId),
    ]);

  const totalTokens =
    estimateTokens(canonicalState) +
    estimateTokens(recentEventWindow) +
    estimateTokens(rollingSummary ?? "") +
    estimateTokens(stylePolicy) +
    estimateTokens(visualBible ?? "");

  if (totalTokens > TOKEN_BUDGET.total) {
    console.warn(
      `[memory] bundle for ${workerName} exceeds token budget: ${totalTokens}/${TOKEN_BUDGET.total}`,
    );
  }

  return {
    canonicalState,
    recentEventWindow,
    rollingSummary,
    stylePolicy,
    visualBible,
  };
}
