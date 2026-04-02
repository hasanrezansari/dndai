import { randomUUID } from "crypto";

import { and, asc, eq } from "drizzle-orm";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 60;

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { getAIProvider } from "@/lib/ai";
import { CampaignSeedOutputSchema, type CampaignSeedOutput } from "@/lib/schemas/ai-io";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import { COPY } from "@/lib/copy/ashveil";
import { db } from "@/lib/db";
import { ROMA_SEEDS } from "@/lib/rome/seeder";
import type { RomaModuleKey } from "@/lib/rome/modules";
import {
  characters,
  narrativeEvents,
  npcStates,
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
import { initializeQuestState } from "@/server/services/quest-service";
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

const CAMPAIGN_SEEDER_SYSTEM = `You are the Campaign Seeder for Ashveil, a dark fantasy tabletop RPG. Generate a complete campaign setup from a theme or prompt.

Output JSON with ALL these fields:
- "campaign_title": evocative 3-6 word title
- "world_summary": 2-3 sentence world description
- "opening_mission": what the party must do first (1-2 sentences)
- "objective": clear quest objective (1 sentence)
- "first_scene": { "title": "location name", "description": "80-120 word cinematic opening narration", "sensory_tags": ["sight", "sound", "smell"] }
- "initial_npcs": array of 1-3 NPCs each with { "name", "role", "attitude", "hook" (optional 1-sentence plot hook) }
- "initial_threat": 1-sentence description of the primary danger
- "tone": overall mood (e.g. "grim and desperate", "mysterious and foreboding")
- "style_policy": narrative style guidance for future narration (1-2 sentences)
- "visual_bible_seed": { "palette": "color description", "motifs": "recurring visual elements", "architecture": "building style" }

Make it dark fantasy. Keep the opening scene atmospheric and evocative, not action-packed.`;

function isRomaModuleKey(key: string): key is RomaModuleKey {
  return Object.prototype.hasOwnProperty.call(ROMA_SEEDS, key);
}

function buildSeederSystemPrompt(params: {
  campaignMode: string;
  moduleKey: string | null;
}): string {
  if (
    params.campaignMode === "module" &&
    params.moduleKey &&
    isRomaModuleKey(params.moduleKey)
  ) {
    const seed = ROMA_SEEDS[params.moduleKey];
    return `You are the Campaign Seeder for PlayRomana, a curated Roman adventure experience.\n\n${CAMPAIGN_SEEDER_SYSTEM}\n\nAdditional constraints for this module:\n- Setting: Ancient Rome\n- Style policy: ${seed.stylePolicyAddon}\n- Visual bible: palette=${seed.visualBibleSeed.palette}; motifs=${seed.visualBibleSeed.motifs}; architecture=${seed.visualBibleSeed.architecture}\n\nDo NOT mention modern times. Do NOT use modern slang.\nIf you include any supernatural elements, keep them rare, grounded, and framed as cult ritual or superstition unless explicitly required.`;
  }
  return CAMPAIGN_SEEDER_SYSTEM;
}

const FallbackOpeningSchema = z.object({
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
    const moduleKey = activeSession?.module_key?.trim() || null;
    const effectiveAdventurePrompt =
      activeSession?.campaign_mode === "module" &&
      moduleKey &&
      isRomaModuleKey(moduleKey)
        ? ROMA_SEEDS[moduleKey].theme
        : adventurePrompt;

    let seededObjective = `Complete the mission: ${effectiveAdventurePrompt}`;
    let seededSubObjectives: string[] | undefined;

    try {
      const provider = getAIProvider();
      const seedUserPrompt = JSON.stringify({
        adventure_theme: effectiveAdventurePrompt,
        characters: charNames,
        player_count: allPlayers.length,
        mode: activeSession?.mode,
        campaign_mode: activeSession?.campaign_mode ?? "user_prompt",
        module_key: moduleKey,
      });

      const seedResult = await runOrchestrationStep<CampaignSeedOutput>({
        stepName: "campaign_seeder",
        sessionId,
        turnId: null,
        provider,
        model: "heavy",
        systemPrompt: buildSeederSystemPrompt({
          campaignMode: activeSession?.campaign_mode ?? "user_prompt",
          moduleKey,
        }),
        userPrompt: seedUserPrompt,
        schema: CampaignSeedOutputSchema,
        maxTokens: 1200,
        temperature: 0.85,
        timeoutMs: 25_000,
      });
      const seed = seedResult.data;

      openingScene = seed.first_scene.description;
      campaignTitle = seed.campaign_title.trim() || campaignTitle;
      seededObjective = seed.objective;

      const missionParts = seed.opening_mission.split(/[.!?]\s+/).filter(Boolean);
      if (missionParts.length > 1) {
        seededSubObjectives = missionParts.map((p) => p.replace(/[.!?]$/, "").trim());
      }

      const seedExtras: Record<string, unknown> = {};
      if (seed.world_summary) seedExtras.world_summary = seed.world_summary;
      if (seed.style_policy) seedExtras.style_policy = seed.style_policy;
      if (seed.tone) seedExtras.tone = seed.tone;
      if (seed.visual_bible_seed) seedExtras.visual_bible_seed = seed.visual_bible_seed;

      if (Object.keys(seedExtras).length > 0) {
        await db
          .update(sessions)
          .set(seedExtras)
          .where(eq(sessions.id, sessionId));
      }

      if (seed.initial_npcs?.length) {
        for (const npc of seed.initial_npcs) {
          try {
            const vp: Record<string, unknown> =
              npc.visual_profile && typeof npc.visual_profile === "object" && !Array.isArray(npc.visual_profile)
                ? (npc.visual_profile as Record<string, unknown>)
                : {};
            const hpRaw = vp.hp ?? vp.current_hp ?? vp.hit_points;
            const maxHpRaw = vp.max_hp ?? vp.maxHitPoints ?? vp.max_hit_points ?? hpRaw;
            const acRaw = vp.ac ?? vp.AC ?? vp.armor_class;
            const hp = Math.max(1, Number.isFinite(Number(hpRaw)) ? Number(hpRaw) : 12);
            const maxHp = Math.max(hp, Number.isFinite(Number(maxHpRaw)) ? Number(maxHpRaw) : hp);
            const ac = Math.max(5, Number.isFinite(Number(acRaw)) ? Number(acRaw) : 12);
            const weakRaw = vp.weak_points;
            const weakPoints = Array.isArray(weakRaw)
              ? weakRaw.map((x) => String(x).trim()).filter((x) => x.length > 0)
              : [];
            await db.insert(npcStates).values({
              session_id: sessionId,
              name: npc.name,
              role: npc.role,
              attitude: npc.attitude,
              status: "alive",
              location: seed.first_scene.title || "Unknown",
              hp,
              max_hp: maxHp,
              ac,
              weak_points: weakPoints,
              reveal_level: "none",
              visual_profile: npc.visual_profile ?? {},
              notes: npc.hook ?? "",
            });
          } catch (npcErr) {
            console.error("[start] NPC insert failed:", npcErr);
          }
        }
      }
    } catch (err) {
      console.error("[start] AI seeder failed, trying simple opening:", err instanceof Error ? err.message : err);
      try {
        const provider = getAIProvider();
        const fallbackResult = await runOrchestrationStep({
          stepName: "campaign_seeder_fallback",
          sessionId,
          turnId: null,
          provider,
          model: "light",
          systemPrompt: `You are the Dungeon Master of Ashveil, a dark fantasy RPG. Generate a cinematic opening scene. 80-120 words. Output JSON: { "scene_text": "...", "campaign_title": "..." }`,
          userPrompt: JSON.stringify({ adventure_theme: adventurePrompt, characters: charNames }),
          schema: FallbackOpeningSchema,
          maxTokens: 500,
          temperature: 0.8,
          timeoutMs: 15_000,
        });
        openingScene = fallbackResult.data.scene_text;
        campaignTitle = fallbackResult.data.campaign_title.trim() || campaignTitle;
      } catch {
        openingScene = buildTemplateFallback(charNames, adventurePrompt);
      }
    }

    await db
      .update(sessions)
      .set({
        campaign_title: campaignTitle,
        updated_at: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    await initializeQuestState({
      sessionId,
      objective: seededObjective,
      subObjectives: seededSubObjectives,
      round: activeSession?.current_round ?? 1,
    });

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
    const imgSceneCtx = [campaignTitle, effectiveAdventurePrompt]
      .filter(Boolean)
      .join(" ");
    after(async () => {
      try {
        console.log("[image-after] starting image generation for opening scene");
        const result = await runImagePipeline({
          sessionId,
          turnId: firstTurnId,
          narrativeText: openingScene,
          sceneContext: imgSceneCtx,
          characterNames: imgCharNames,
        });
        console.log("[image-after] pipeline done, imageUrl:", !!result.imageUrl);
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
