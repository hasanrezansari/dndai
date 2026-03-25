import { desc, eq } from "drizzle-orm";

import { generateSceneImageOpenRouter } from "@/lib/ai/openrouter-image-provider";
import { db } from "@/lib/db";
import {
  characters,
  imageJobs,
  players,
  sceneSnapshots,
  sessions,
} from "@/lib/db/schema";
import { logTrace } from "@/lib/orchestrator/trace";

const ART_STYLE = [
  "dark fantasy oil painting",
  "muted earth tones with amber torchlight and deep shadows",
  "detailed painterly brushwork",
  "medieval high-fantasy aesthetic",
  "cinematic dramatic lighting",
  "rich atmospheric perspective",
].join(", ");

const NEGATIVE = "text, watermark, UI, HUD, speech bubbles, modern objects, blurry, low quality, anime, cartoon, chibi, bright neon colors, photo-realistic";

async function fetchPartyDescriptions(sessionId: string): Promise<string> {
  const rows = await db
    .select({
      name: characters.name,
      class: characters.class,
      race: characters.race,
      visual_profile: characters.visual_profile,
    })
    .from(characters)
    .innerJoin(players, eq(players.id, characters.player_id))
    .where(eq(players.session_id, sessionId));

  if (rows.length === 0) return "a party of adventurers";

  return rows
    .map((r) => {
      const vp = (r.visual_profile ?? {}) as Record<string, unknown>;
      const traits = Array.isArray(vp.traits) ? vp.traits.map(String).join(", ") : "";
      const base = `${r.name} (${r.race} ${r.class})`;
      return traits ? `${base} [${traits}]` : base;
    })
    .join(", ");
}

function buildPrompt(params: {
  narrativeText: string;
  sceneContext: string;
  partyDescription: string;
  previousPrompt: string | null;
  imageHint?: {
    subjects?: string[];
    environment?: string;
    mood?: string;
    avoid?: string[];
  };
}): string {
  const { narrativeText, sceneContext, partyDescription, previousPrompt, imageHint } = params;

  const scene = sceneContext.trim().slice(0, 300) || narrativeText.slice(0, 300);
  const action = narrativeText.slice(0, 250);

  const continuityHint = previousPrompt
    ? `\nMaintain the same environment, architecture, and color palette as the previous scene. Show visual progression, not a new location unless the story moved.`
    : "";

  const subjectLine =
    imageHint?.subjects?.length
      ? `Key subjects: ${imageHint.subjects.join(", ")}.`
      : "";
  const envLine = imageHint?.environment
    ? `Environment: ${imageHint.environment}.`
    : "";
  const moodLine = imageHint?.mood ? `Mood: ${imageHint.mood}.` : "";

  return [
    `Art style: ${ART_STYLE}.`,
    `Scene: ${scene}`,
    `Current moment: ${action}`,
    subjectLine,
    envLine,
    moodLine,
    `Characters present: ${partyDescription}.`,
    continuityHint,
    `Keep character appearances consistent. Wide cinematic composition, 16:9 aspect ratio, no text or UI overlays.`,
  ].filter(Boolean).join("\n");
}

export async function runImagePipeline(params: {
  sessionId: string;
  turnId: string;
  narrativeText: string;
  sceneContext: string;
  characterNames: string[];
  imageHint?: {
    subjects?: string[];
    environment?: string;
    mood?: string;
    avoid?: string[];
  };
}): Promise<{ imageUrl: string | null }> {
  const { sessionId, turnId, narrativeText, sceneContext, imageHint } = params;

  const partyDescription = await fetchPartyDescriptions(sessionId);

  const [prevSnap] = await db
    .select({
      image_prompt: sceneSnapshots.image_prompt,
      summary: sceneSnapshots.summary,
    })
    .from(sceneSnapshots)
    .where(eq(sceneSnapshots.session_id, sessionId))
    .orderBy(desc(sceneSnapshots.created_at))
    .limit(1);

  const composedPrompt = buildPrompt({
    narrativeText,
    sceneContext,
    partyDescription,
    previousPrompt: prevSnap?.image_prompt ?? null,
    imageHint,
  });

  const tStart = Date.now();
  let base64: string;
  try {
    const out = await generateSceneImageOpenRouter({
      prompt: composedPrompt,
      negativePrompt: NEGATIVE,
    });
    base64 = out.base64;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logTrace({
      sessionId,
      turnId,
      stepName: "scene_image_openrouter",
      input: { prompt_prefix: composedPrompt.slice(0, 120) },
      output: {},
      modelUsed: "gemini-2.5-flash-image",
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: Date.now() - tStart,
      success: false,
      errorMessage: msg,
    });
    return { imageUrl: null };
  }

  await logTrace({
    sessionId,
    turnId,
    stepName: "scene_image_openrouter",
    input: { prompt_prefix: composedPrompt.slice(0, 120) },
    output: { has_data: true },
    modelUsed: "gemini-2.5-flash-image",
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: Date.now() - tStart,
    success: true,
  });

  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessionRow) {
    await logTrace({
      sessionId,
      turnId,
      stepName: "scene_image_persist",
      input: {},
      output: {},
      modelUsed: "deterministic",
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      success: false,
      errorMessage: "session not found",
    });
    return { imageUrl: null };
  }

  const summary =
    prevSnap?.summary?.trim() ||
    sceneContext.trim().slice(0, 4000) ||
    narrativeText.slice(0, 500);

  const dataUrl = `data:image/png;base64,${base64}`;

  try {
    const [snap] = await db
      .insert(sceneSnapshots)
      .values({
        session_id: sessionId,
        round_number: sessionRow.current_round,
        state_version: sessionRow.state_version,
        summary,
        image_status: "ready",
        image_prompt: composedPrompt,
        image_url: dataUrl,
      })
      .returning();

    const servingUrl = `/api/sessions/${sessionId}/scene-image/${snap!.id}`;

    await db.insert(imageJobs).values({
      session_id: sessionId,
      scene_snapshot_id: snap?.id ?? null,
      prompt: composedPrompt,
      status: "completed",
      provider: "openrouter",
      image_url: servingUrl,
      completed_at: new Date(),
    });

    await logTrace({
      sessionId,
      turnId,
      stepName: "scene_image_persist",
      input: { snapshot: !!snap },
      output: { image_job: "inserted" },
      modelUsed: "deterministic",
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      success: true,
    });

    return { imageUrl: servingUrl };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logTrace({
      sessionId,
      turnId,
      stepName: "scene_image_persist",
      input: {},
      output: {},
      modelUsed: "deterministic",
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      success: false,
      errorMessage: msg,
    });
    return { imageUrl: null };
  }
}
