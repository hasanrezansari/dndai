import { desc, eq } from "drizzle-orm";

import { generateSceneImage } from "@/lib/ai/image-provider";
import { db } from "@/lib/db";
import {
  imageJobs,
  sceneSnapshots,
  sessions,
} from "@/lib/db/schema";
import { logTrace } from "@/lib/orchestrator/trace";

export async function runImagePipeline(params: {
  sessionId: string;
  turnId: string;
  narrativeText: string;
  sceneContext: string;
  characterNames: string[];
}): Promise<{ imageUrl: string | null }> {
  const { sessionId, turnId, narrativeText, sceneContext, characterNames } =
    params;
  const sceneSummary = sceneContext.trim().slice(0, 200) || narrativeText.slice(0, 200);
  const chars = characterNames.length > 0 ? characterNames.join(", ") : "adventurers";
  const composedPrompt = `Dark fantasy RPG scene: ${sceneSummary}. Characters: ${chars}. Dramatic cinematic lighting, painterly fantasy illustration, detailed environment, atmospheric, no text or UI.`;

  const tFal = Date.now();
  let imageUrl: string;
  let seed = 0;
  try {
    const out = await generateSceneImage({ prompt: composedPrompt });
    imageUrl = out.imageUrl;
    seed = out.seed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logTrace({
      sessionId,
      turnId,
      stepName: "scene_image_fal",
      input: { prompt_prefix: composedPrompt.slice(0, 120) },
      output: {},
      modelUsed: "fal-ai/fast-sdxl",
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: Date.now() - tFal,
      success: false,
      errorMessage: msg,
    });
    return { imageUrl: null };
  }

  await logTrace({
    sessionId,
    turnId,
    stepName: "scene_image_fal",
    input: { prompt_prefix: composedPrompt.slice(0, 120) },
    output: { seed, has_url: true },
    modelUsed: "fal-ai/fast-sdxl",
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: Date.now() - tFal,
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

  const [latestSnap] = await db
    .select()
    .from(sceneSnapshots)
    .where(eq(sceneSnapshots.session_id, sessionId))
    .orderBy(desc(sceneSnapshots.created_at))
    .limit(1);

  const summary =
    latestSnap?.summary?.trim() ||
    sceneContext.trim().slice(0, 4000) ||
    narrativeText.slice(0, 500);

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
        image_url: imageUrl,
      })
      .returning();

    await db.insert(imageJobs).values({
      session_id: sessionId,
      scene_snapshot_id: snap?.id ?? null,
      prompt: composedPrompt,
      status: "completed",
      provider: "fal",
      image_url: imageUrl,
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

  return { imageUrl };
}
