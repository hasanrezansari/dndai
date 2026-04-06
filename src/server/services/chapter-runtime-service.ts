import { eq, sql } from "drizzle-orm";

import {
  CHAPTER_PRESETS,
  isChapterTurnCapExceeded,
  MANUAL_SCENE_IMAGE_COOLDOWN_SEC,
  normalizeVisualRhythmPreset,
  type VisualRhythmPreset,
} from "@/lib/chapter/chapter-config";
import { db } from "@/lib/db";
import { narrativeEvents, sessions } from "@/lib/db/schema";
import {
  getQuestState,
  syncQuestStateAfterChapterAdvance,
} from "@/server/services/quest-service";

export async function assertCampaignChapterAllowsAiTurn(params: {
  sessionId: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: 409; code: "chapter_turn_cap"; error: string }
> {
  const [row] = await db
    .select({
      game_kind: sessions.game_kind,
      status: sessions.status,
      mode: sessions.mode,
      current_round: sessions.current_round,
      chapter_start_round: sessions.chapter_start_round,
      chapter_max_turns: sessions.chapter_max_turns,
    })
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);

  if (!row || row.game_kind !== "campaign" || row.status !== "active") {
    return { ok: true };
  }
  if (row.mode !== "ai_dm") {
    return { ok: true };
  }

  if (
    isChapterTurnCapExceeded({
      currentRound: row.current_round,
      chapterStartRound: row.chapter_start_round,
      chapterMaxTurns: row.chapter_max_turns,
    })
  ) {
    return {
      ok: false,
      status: 409,
      code: "chapter_turn_cap",
      error:
        "This chapter has reached its turn limit. The host should start the next chapter from the quest panel.",
    };
  }

  return { ok: true };
}

export async function assertChapterImageBudget(params: {
  sessionId: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: 409; code: "chapter_image_budget"; error: string }
> {
  const [row] = await db
    .select({
      game_kind: sessions.game_kind,
      used: sessions.chapter_system_images_used,
      budget: sessions.chapter_system_image_budget,
    })
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);

  if (!row) {
    return { ok: true };
  }
  if (row.game_kind !== "campaign" && row.game_kind !== "party") {
    return { ok: true };
  }
  if (row.used >= row.budget) {
    return {
      ok: false,
      status: 409,
      code: "chapter_image_budget",
      error:
        row.game_kind === "party"
          ? "This session’s automatic scene-image budget is spent for the current stretch. The table can keep playing; further round art needs a new budget window or manual images if you add them later."
          : "This chapter’s automatic scene-image budget is spent. Continue to the next chapter or wait for manual images if the table allows them.",
    };
  }
  return { ok: true };
}

export async function assertManualImageCooldown(params: {
  sessionId: string;
  internalRequest: boolean;
}): Promise<
  | { ok: true }
  | { ok: false; status: 429; error: string }
> {
  if (params.internalRequest) return { ok: true };

  const [row] = await db
    .select({ lastAt: sessions.last_manual_scene_image_at })
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);

  const last = row?.lastAt;
  if (last instanceof Date) {
    const delta = Date.now() - last.getTime();
    if (delta < MANUAL_SCENE_IMAGE_COOLDOWN_SEC * 1000) {
      const wait = Math.ceil(
        (MANUAL_SCENE_IMAGE_COOLDOWN_SEC * 1000 - delta) / 1000,
      );
      return {
        ok: false,
        status: 429,
        error: `Please wait ${wait}s before requesting another scene image.`,
      };
    }
  }
  return { ok: true };
}

export async function incrementChapterSystemImageUsage(
  sessionId: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({
      chapter_system_images_used: sql`${sessions.chapter_system_images_used} + 1`,
      updated_at: new Date(),
    })
    .where(
      eq(sessions.id, sessionId),
    );
}

export async function touchManualSceneImageTimestamp(
  sessionId: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({
      last_manual_scene_image_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(sessions.id, sessionId));
}

/**
 * Host continues narrative chapter: resets turn window + image budget, template recap.
 */
export async function continueChapterNarrative(params: {
  sessionId: string;
  hostUserId: string;
}): Promise<
  | { ok: true; stateVersion: number }
  | { ok: false; status: number; error: string }
> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);

  if (!row) return { ok: false, status: 404, error: "Not found" };
  if (row.host_user_id !== params.hostUserId) {
    return { ok: false, status: 403, error: "Only the host can continue the chapter" };
  }
  if (row.status !== "active") {
    return { ok: false, status: 409, error: "Session is not active" };
  }
  if (row.game_kind !== "campaign") {
    return { ok: false, status: 409, error: "Not a campaign session" };
  }

  const nextChapterIndex = row.chapter_index + 1;
  const recapQuest = await getQuestState(params.sessionId);
  const objective =
    recapQuest?.objective?.trim() || "The path ahead still unwinds.";
  const recapText = `— Chapter ${row.chapter_index} closes —\n\n${objective}\n\nThe table steadies itself and walks into the next movement of the tale.`;

  const [updated] = await db
    .update(sessions)
    .set({
      chapter_index: nextChapterIndex,
      chapter_start_round: row.current_round,
      chapter_system_images_used: 0,
      state_version: sql`${sessions.state_version} + 1`,
      updated_at: new Date(),
    })
    .where(eq(sessions.id, params.sessionId))
    .returning({ stateVersion: sessions.state_version });

  await db.insert(narrativeEvents).values({
    session_id: params.sessionId,
    turn_id: null,
    scene_text: recapText,
    visible_changes: ["Chapter continued"],
    tone: "recap",
    next_actor_id: null,
    image_hint: {},
  });

  await syncQuestStateAfterChapterAdvance({
    sessionId: params.sessionId,
    chapterIndex: nextChapterIndex,
    round: row.current_round,
  });

  return { ok: true, stateVersion: updated?.stateVersion ?? row.state_version + 1 };
}

/**
 * When the ending vote fails and the table keeps playing, roll the chapter window
 * without inserting recap noise (facilitator notice already went out).
 */
export async function rollChapterWindowAfterVoteCooldown(
  sessionId: string,
): Promise<number> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) return 0;

  const nextChapterIndex = row.chapter_index + 1;

  const [updated] = await db
    .update(sessions)
    .set({
      chapter_index: nextChapterIndex,
      chapter_start_round: row.current_round,
      chapter_system_images_used: 0,
      state_version: sql`${sessions.state_version} + 1`,
      updated_at: new Date(),
    })
    .where(eq(sessions.id, sessionId))
    .returning({ stateVersion: sessions.state_version });

  await syncQuestStateAfterChapterAdvance({
    sessionId,
    chapterIndex: nextChapterIndex,
    round: row.current_round,
  });

  return updated?.stateVersion ?? 0;
}

export function capsForPreset(preset: VisualRhythmPreset) {
  return CHAPTER_PRESETS[preset];
}

export { normalizeVisualRhythmPreset };
