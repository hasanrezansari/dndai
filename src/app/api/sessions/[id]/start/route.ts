import { randomUUID } from "crypto";

import { and, asc, eq } from "drizzle-orm";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";

export const maxDuration = 60;
import { getAIProvider } from "@/lib/ai";
import { COPY } from "@/lib/copy/ashveil";
import { db } from "@/lib/db";
import {
  characters,
  narrativeEvents,
  players,
  sessions,
} from "@/lib/db/schema";
import { runImagePipeline } from "@/lib/orchestrator/image-worker";
import { broadcastToSession } from "@/lib/socket/server";
import {
  canStartSession,
  SessionNotFoundError,
  startSession,
} from "@/server/services/session-service";
import { createFirstTurn } from "@/server/services/turn-service";

const BodySchema = z.object({
  playerId: z.string().uuid(),
});

const OPENINGS = [
  (chars: string, theme: string) =>
    `The wind carries the scent of ash and iron as ${chars} gather at the threshold of the unknown. ${theme ? `Whispers speak of ${theme} —` : "Ancient forces stir —"} a darkness that has festered beneath the surface for far too long. Torches gutter in an unnatural breeze. The path ahead is uncertain, the shadows deep, but the call of adventure is undeniable. Steel your nerves. Your legend begins now.`,
  (chars: string, theme: string) =>
    `A heavy fog clings to the cobblestones as ${chars} arrive at the crossroads of fate. ${theme ? `The promise of ${theme} hangs in the air,` : "Something ancient and hungry waits,"} patient as stone, old as the mountains themselves. The tavern behind you grows distant. Ahead, only darkness and the faint echo of something stirring. Draw your weapons. Light your torches. The world will remember what happens next.`,
  (chars: string, theme: string) =>
    `Thunder rolls across a bruised sky as ${chars} stand before the gates of destiny. ${theme ? `Tales of ${theme} have drawn you here,` : "An unseen force has drawn you together,"} each carrying your own scars, your own reasons. The road behind is gone — there is only forward now. Somewhere in the deep dark, something waits. It has been waiting for a very long time. Your story begins.`,
];

function buildTemplateFallback(charNames: string, adventurePrompt: string): string {
  const fn = OPENINGS[Math.floor(Math.random() * OPENINGS.length)]!;
  return fn(charNames || "the adventurers", adventurePrompt);
}

const OpeningSchema = z.object({
  scene_text: z.string(),
  campaign_title: z.string(),
});

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
    if (!parsed.success) {
      return apiError("Invalid body", 400);
    }

    const [hostPlayer] = await db
      .select()
      .from(players)
      .where(
        and(
          eq(players.id, parsed.data.playerId),
          eq(players.session_id, sessionId),
        ),
      )
      .limit(1);

    if (!hostPlayer?.is_host || hostPlayer.user_id !== user.id) {
      return apiError("Forbidden", 403);
    }

    const [sessionRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!sessionRow) {
      return apiError("Not found", 404);
    }

    if (sessionRow.status !== "lobby") {
      return apiError("Session already started", 409);
    }

    if (!(await canStartSession(sessionId))) {
      return apiError("Not all players are ready", 409);
    }

    const started = await startSession(sessionId);
    if (!started) {
      return apiError("Could not start session", 409);
    }

    const firstTurnId = await createFirstTurn(sessionId);

    const [activeSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    let campaignTitle =
      activeSession?.campaign_title?.trim() || "Adventure";
    let openingScene =
      activeSession?.adventure_prompt?.trim() ||
      "The table settles. Your story begins.";

    const allPlayers = await db
      .select()
      .from(players)
      .where(eq(players.session_id, sessionId))
      .orderBy(asc(players.seat_index));

    const allChars = await Promise.all(
      allPlayers.map(async (p) => {
        const [c] = await db
          .select()
          .from(characters)
          .where(eq(characters.player_id, p.id))
          .limit(1);
        return c;
      }),
    );

    const charNames = allChars
      .filter(Boolean)
      .map((c) => `${c!.name} the ${c!.class}`)
      .join(", ");

    const characterNamesForImage = allChars
      .filter(Boolean)
      .map((c) => c!.name);

    const adventurePrompt =
      activeSession?.adventure_prompt?.trim() ||
      "a mysterious dark fantasy adventure";

    try {
      const provider = getAIProvider();
      const aiCall = provider.generateStructured({
        model: "light",
        systemPrompt: `You are the Dungeon Master of Ashveil, a dark fantasy RPG. Generate a cinematic opening scene that sets the world, atmosphere, and initial situation for the players. 80-120 words. Output JSON: { "scene_text": "...", "campaign_title": "..." }`,
        userPrompt: JSON.stringify({
          adventure_theme: adventurePrompt,
          characters: charNames,
          mode: activeSession?.mode,
        }),
        schema: OpeningSchema,
        maxTokens: 500,
        temperature: 0.8,
      });
      const openingResult = await Promise.race([
        aiCall,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("opening timeout")), 20_000),
        ),
      ]);
      openingScene = openingResult.data.scene_text;
      campaignTitle =
        openingResult.data.campaign_title.trim() || campaignTitle;
    } catch (err) {
      console.error("[start] AI opening failed, using template:", err instanceof Error ? err.message : err);
      openingScene = buildTemplateFallback(charNames, adventurePrompt);
    }

    await db
      .update(sessions)
      .set({
        campaign_title: campaignTitle,
        updated_at: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    await db.insert(narrativeEvents).values({
      session_id: sessionId,
      turn_id: firstTurnId,
      scene_text: openingScene,
      visible_changes: [],
      tone: "opening",
      next_actor_id: activeSession?.current_player_id ?? null,
      image_hint: {},
    });

    const sceneImageId = randomUUID();
    try {
      await broadcastToSession(sessionId, "scene-image-pending", {
        scene_id: sceneImageId,
        label: COPY.scenePending,
      });
    } catch (err) {
      console.error(err);
    }
    const imgCharNames =
      characterNamesForImage.length > 0
        ? characterNamesForImage
        : allPlayers.map((p) => p.user_id.slice(0, 8));
    const imgSceneCtx = [campaignTitle, adventurePrompt].filter(Boolean).join(" ");
    after(async () => {
      try {
        const result = await runImagePipeline({
          sessionId,
          turnId: firstTurnId,
          narrativeText: openingScene,
          sceneContext: imgSceneCtx,
          characterNames: imgCharNames,
        });
        if (result.imageUrl) {
          await broadcastToSession(sessionId, "scene-image-ready", {
            scene_id: sceneImageId,
            image_url: result.imageUrl,
          });
        } else {
          await broadcastToSession(sessionId, "scene-image-failed", {
            scene_id: sceneImageId,
          });
        }
      } catch (err) {
        console.error("[image-after] start image failed:", err);
        try {
          await broadcastToSession(sessionId, "scene-image-failed", {
            scene_id: sceneImageId,
          });
        } catch { /* best effort */ }
      }
    });

    try {
      await broadcastToSession(sessionId, "session-started", {
        campaign_title: campaignTitle,
        opening_scene: openingScene,
      });
    } catch (err) {
      console.error(err);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SessionNotFoundError) {
      return apiError("Not found", 404);
    }
    return handleApiError(e);
  }
}
