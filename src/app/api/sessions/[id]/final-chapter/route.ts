import { and, asc, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isPlayerForUser,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  characters,
  narrativeEvents,
  players,
  sessions,
} from "@/lib/db/schema";
import { broadcastToSession } from "@/lib/socket/server";
import { getQuestState } from "@/server/services/quest-service";

const BodySchema = z.object({
  playerId: z.string().uuid(),
});

function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.{20,220}?[.!?])(?:\s|$)/);
  if (m) return m[1]!;
  return clean.length > 220 ? `${clean.slice(0, 217)}...` : clean;
}

function buildFinalChapter(params: {
  campaignTitle: string;
  party: string[];
  earlyBeat: string;
  lateBeat: string;
  questStatus: string;
}): string {
  const partyLine =
    params.party.length > 0 ? params.party.join(", ") : "the adventuring party";
  const outcomeLine =
    params.questStatus === "failed"
      ? "Though the cost was heavy, their tale endures in the halls of memory."
      : "Their resolve carried them through shadow and flame to carve their place in legend.";

  return [
    `Final Chapter: ${params.campaignTitle}`,
    "",
    `${partyLine} crossed the threshold of Ashveil and set their fate against the unknown.`,
    params.earlyBeat,
    params.lateBeat,
    outcomeLine,
    "The table falls quiet. The chronicle is complete.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const { id: sessionId } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return apiError("Invalid session id", 400);
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);

    if (!(await isPlayerForUser(parsed.data.playerId, sessionId, user.id))) {
      return apiError("Forbidden", 403);
    }

    const [sessionRow] = await db
      .select({
        id: sessions.id,
        status: sessions.status,
        campaignTitle: sessions.campaign_title,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!sessionRow) return apiError("Not found", 404);
    if (sessionRow.status !== "ended") {
      return apiError("Session must be ended first", 409);
    }

    const [existingChapter] = await db
      .select({ id: narrativeEvents.id })
      .from(narrativeEvents)
      .where(
        and(
          eq(narrativeEvents.session_id, sessionId),
          eq(narrativeEvents.tone, "epilogue"),
        ),
      )
      .orderBy(desc(narrativeEvents.created_at))
      .limit(1);
    if (existingChapter) {
      return apiError("Final chapter already published", 409);
    }

    const partyRows = await db
      .select({
        playerId: players.id,
        charName: characters.name,
      })
      .from(players)
      .leftJoin(characters, eq(characters.player_id, players.id))
      .where(and(eq(players.session_id, sessionId), eq(players.is_dm, false)))
      .orderBy(asc(players.seat_index));

    const partyNames = partyRows
      .map((r) => r.charName?.trim())
      .filter((n): n is string => Boolean(n));

    const recentNarratives = await db
      .select({
        sceneText: narrativeEvents.scene_text,
        tone: narrativeEvents.tone,
      })
      .from(narrativeEvents)
      .where(eq(narrativeEvents.session_id, sessionId))
      .orderBy(desc(narrativeEvents.created_at))
      .limit(24);

    const chronological = [...recentNarratives].reverse();
    const narrativeTexts = chronological
      .filter((r) => r.tone !== "epilogue")
      .map((r) => r.sceneText);

    const earlyBeat = narrativeTexts[0]
      ? firstSentence(narrativeTexts[0])
      : "Their first steps were uncertain, but their purpose was clear.";
    const lateBeat = narrativeTexts[narrativeTexts.length - 1]
      ? firstSentence(narrativeTexts[narrativeTexts.length - 1]!)
      : "In the final hours, every choice weighed like steel.";

    const quest = await getQuestState(sessionId);
    const chapter = buildFinalChapter({
      campaignTitle: sessionRow.campaignTitle?.trim() || "Ashveil Chronicle",
      party: partyNames,
      earlyBeat,
      lateBeat,
      questStatus: quest?.status ?? "active",
    });

    const [inserted] = await db
      .insert(narrativeEvents)
      .values({
        session_id: sessionId,
        turn_id: null,
        scene_text: chapter,
        visible_changes: ["Final chapter published"],
        tone: "epilogue",
        next_actor_id: null,
        image_hint: {},
      })
      .returning({ id: narrativeEvents.id });
    if (!inserted) {
      return apiError("Could not publish final chapter", 500);
    }

    const [updatedSession] = await db
      .update(sessions)
      .set({
        state_version: sql`${sessions.state_version} + 1`,
        updated_at: new Date(),
      })
      .where(eq(sessions.id, sessionId))
      .returning({
        stateVersion: sessions.state_version,
      });
    const stateVersion = updatedSession?.stateVersion ?? 0;
    const fallbackActor = partyRows[0]?.playerId ?? parsed.data.playerId;

    try {
      await broadcastToSession(sessionId, "narration-update", {
        scene_text: chapter,
        visible_changes: ["Final chapter published"],
        next_actor: { player_id: fallbackActor },
        event_type: "dm_event",
      });
    } catch (err) {
      console.error(err);
    }
    try {
      await broadcastToSession(sessionId, "dm-notice", {
        message: "Final chapter published to the journal.",
      });
    } catch (err) {
      console.error(err);
    }
    try {
      await broadcastToSession(sessionId, "state-update", {
        changes: [],
        state_version: stateVersion,
      });
    } catch (err) {
      console.error(err);
    }

    return NextResponse.json({ ok: true, chapter });
  } catch (e) {
    return handleApiError(e);
  }
}

