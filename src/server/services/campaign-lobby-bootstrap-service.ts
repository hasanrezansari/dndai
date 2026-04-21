import { randomUUID } from "crypto";

import { asc, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";

import { getAIProvider } from "@/lib/ai";
import { isPlayRomanaModuleKey } from "@/lib/ai/narrative-session-profile";
import { COPY } from "@/lib/copy/ashveil";
import { db } from "@/lib/db";
import { ROMA_SEEDS } from "@/lib/rome/seeder";
import {
  characters,
  narrativeEvents,
  npcStates,
  players,
  sessions,
  turns,
} from "@/lib/db/schema";
import { runImagePipeline } from "@/lib/orchestrator/image-worker";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import { CampaignSeedOutputSchema, type CampaignSeedOutput } from "@/lib/schemas/ai-io";
import { broadcastToSession } from "@/lib/socket/server";
import {
  assertChapterImageBudget,
  incrementChapterSystemImageUsage,
} from "@/server/services/chapter-runtime-service";
import { initializeQuestState } from "@/server/services/quest-service";
import {
  acquireTurnLock,
  createFirstTurn,
  releaseTurnLock,
} from "@/server/services/turn-service";

const OPENINGS = [
  (chars: string, theme: string) =>
    `${chars} gather as the story finds its opening beat. ${theme ? `The thread of ${theme} pulls you in —` : "Possibility hangs in the air —"} every choice from here will shape what comes next. The table holds its breath; the world leans in to listen.`,
  (chars: string, theme: string) =>
    `The scene opens on ${chars}. ${theme ? `${theme} colors the moment —` : "Something worth noticing stirs —"} not yet resolved, not yet named, but real enough to chase. You are here; what you do with that is the game.`,
  (chars: string, theme: string) =>
    `${chars} step into the first page together. ${theme ? `Whispers of ${theme} echo at the edges —` : "The path ahead is unwritten —"} tension and curiosity share the same breath. Your chronicle begins now.`,
];

function buildTemplateFallback(charNames: string, adventurePrompt: string): string {
  const fn = OPENINGS[Math.floor(Math.random() * OPENINGS.length)]!;
  return fn(charNames || "the adventurers", adventurePrompt);
}

const CAMPAIGN_SEEDER_JSON_SPEC = `Output JSON with ALL these fields:
- "campaign_title": evocative 3-6 word title
- "world_summary": 2-3 sentence world description
- "opening_mission": what the party must do first (1-2 sentences)
- "objective": clear quest objective (1 sentence)
- "first_scene": { "title": "location name", "description": "80-120 word cinematic opening narration", "sensory_tags": ["sight", "sound", "smell"] }
- "initial_npcs": array of 1-3 NPCs each with { "name", "role", "attitude", "hook" (optional 1-sentence plot hook) }
- "initial_threat": 1-sentence description of the main tension or unknown (not only monsters—it may be social, political, environmental, or relational)
- "tone": overall mood matching the requested genre
- "style_policy": narrative style guidance for future narration (1-2 sentences)
- "visual_bible_seed": { "palette": "color description", "motifs": "recurring visual elements", "architecture": "building style" }`;

const OPEN_CAMPAIGN_SEEDER_SYSTEM = `You are the Campaign Seeder for a collaborative multiplayer tabletop RPG. Generate a complete campaign setup from a theme or prompt.

${CAMPAIGN_SEEDER_JSON_SPEC}

Rules:
- Honor adventure_theme, world_bible (if provided), and adventure_tags: match genre, tone, and setting. Do not default to medieval dark fantasy unless the theme clearly implies it.
- Keep the opening scene suited to the theme (atmospheric when appropriate; lighter or faster-paced when the theme calls for it).`;

function buildSeederSystemPrompt(params: {
  campaignMode: string;
  moduleKey: string | null;
}): string {
  if (
    params.campaignMode === "module" &&
    params.moduleKey &&
    isPlayRomanaModuleKey(params.moduleKey)
  ) {
    const seed = ROMA_SEEDS[params.moduleKey];
    return `You are the Campaign Seeder for PlayRomana, a curated Ancient Rome tabletop experience.

${CAMPAIGN_SEEDER_JSON_SPEC}

Additional constraints for this module:
- Setting: Ancient Rome
- Style policy: ${seed.stylePolicyAddon}
- Visual bible: palette=${seed.visualBibleSeed.palette}; motifs=${seed.visualBibleSeed.motifs}; architecture=${seed.visualBibleSeed.architecture}

Do NOT mention modern times. Do NOT use modern slang.
If you include any supernatural elements, keep them rare, grounded, and framed as cult ritual or superstition unless explicitly required.
Keep the opening scene atmospheric and evocative, not action-packed.`;
  }
  return OPEN_CAMPAIGN_SEEDER_SYSTEM;
}

const FallbackOpeningSchema = z.object({
  scene_text: z.string(),
  campaign_title: z.string(),
});

export async function allSessionPlayersHaveCharacterIds(
  sessionId: string,
): Promise<boolean> {
  const rows = await db
    .select({ character_id: players.character_id })
    .from(players)
    .where(eq(players.session_id, sessionId));
  if (rows.length === 0) return false;
  return rows.every((r) => r.character_id != null);
}

export async function sessionHasAnyTurn(sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: turns.id })
    .from(turns)
    .where(eq(turns.session_id, sessionId))
    .limit(1);
  return Boolean(row);
}

export type RunCampaignOpeningOptions = {
  quickPlay: boolean;
  /**
   * When false, skips the final `session-started` Pusher payload (DB + narration still written).
   * Used when the table already received a “go build heroes” session-started ping.
   */
  emitSessionStartedEvent?: boolean;
};

/**
 * Creates the first turn, runs campaign seeder + opening narration + opening image job,
 * initializes quest state, and optionally broadcasts `session-started`.
 */
export async function runCampaignOpeningPipeline(
  sessionId: string,
  opts: RunCampaignOpeningOptions,
): Promise<void> {
  const firstTurnId = await createFirstTurn(sessionId);

  const [activeSession] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  let campaignTitle = activeSession?.campaign_title?.trim() || "Adventure";
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

  const characterNamesForImage = allChars.filter(Boolean).map((c) => c!.name);

  const adventurePrompt =
    activeSession?.adventure_prompt?.trim() ||
    "an open-ended collaborative adventure";
  const moduleKey = activeSession?.module_key?.trim() || null;
  const effectiveAdventurePrompt =
    activeSession?.campaign_mode === "module" &&
    moduleKey &&
    isPlayRomanaModuleKey(moduleKey)
      ? ROMA_SEEDS[moduleKey].theme
      : adventurePrompt;

  let seededObjective = `Complete the mission: ${effectiveAdventurePrompt}`;
  let seededSubObjectives: string[] | undefined;

  try {
    const provider = getAIProvider();
    const tagRaw = activeSession?.adventure_tags;
    const adventureTags = Array.isArray(tagRaw) ? tagRaw.map(String) : [];
    const seedUserPrompt = JSON.stringify({
      adventure_theme: effectiveAdventurePrompt,
      world_bible: activeSession?.world_bible?.trim() ?? "",
      adventure_tags: adventureTags,
      art_direction: activeSession?.art_direction?.trim() ?? "",
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
            npc.visual_profile &&
            typeof npc.visual_profile === "object" &&
            !Array.isArray(npc.visual_profile)
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
          console.error("[campaign-bootstrap] NPC insert failed:", npcErr);
        }
      }
    }
  } catch (err) {
    console.error(
      "[campaign-bootstrap] AI seeder failed, trying simple opening:",
      err instanceof Error ? err.message : err,
    );
    try {
      const provider = getAIProvider();
      const fallbackResult = await runOrchestrationStep({
        stepName: "campaign_seeder_fallback",
        sessionId,
        turnId: null,
        provider,
        model: "light",
        systemPrompt: `You are the facilitator for a collaborative tabletop RPG. Match genre and tone to adventure_theme. Generate a cinematic opening scene. 80-120 words. Output JSON: { "scene_text": "...", "campaign_title": "..." }`,
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
  const imgSceneCtx = [campaignTitle, effectiveAdventurePrompt].filter(Boolean).join(" ");
  after(async () => {
    try {
      console.log("[image-after] starting image generation for opening scene");
      const budget = await assertChapterImageBudget({ sessionId });
      if (!budget.ok) {
        await broadcastToSession(sessionId, "scene-image-failed", {
          scene_id: sceneImageId,
        });
        return;
      }
      const result = await runImagePipeline({
        sessionId,
        turnId: firstTurnId,
        narrativeText: openingScene,
        sceneContext: imgSceneCtx,
        characterNames: imgCharNames,
      });
      console.log("[image-after] pipeline done, imageUrl:", !!result.imageUrl);
      if (result.imageUrl) {
        await incrementChapterSystemImageUsage(sessionId);
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
      } catch {
        /* best effort */
      }
    }
  });

  if (opts.emitSessionStartedEvent !== false) {
    try {
      await broadcastToSession(sessionId, "session-started", {
        campaign_title: campaignTitle,
        opening_scene: openingScene,
        game_kind: "campaign",
        quick_play: opts.quickPlay,
      });
    } catch (err) {
      console.error(err);
    }
  }
}

/**
 * When the host has already moved the session to `active` but heroes were created after start,
 * run the full opening pipeline once every seat has a `character_id` and no turns exist yet.
 * Emits the real `session-started` payload (after the lobby’s “prepare your heroes” ping).
 */
export async function tryBootstrapCampaignAfterHeroesSessionReady(
  sessionId: string,
): Promise<{ ran: boolean }> {
  const [s] = await db
    .select({
      status: sessions.status,
      game_kind: sessions.game_kind,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!s || s.status !== "active" || s.game_kind !== "campaign") {
    return { ran: false };
  }
  if (!(await allSessionPlayersHaveCharacterIds(sessionId))) {
    return { ran: false };
  }
  if (await sessionHasAnyTurn(sessionId)) {
    return { ran: false };
  }

  const locked = await acquireTurnLock(sessionId);
  if (!locked) return { ran: false };
  try {
    if (await sessionHasAnyTurn(sessionId)) return { ran: false };
    await runCampaignOpeningPipeline(sessionId, {
      quickPlay: false,
    });
    return { ran: true };
  } catch (err) {
    console.error("[campaign-bootstrap] deferred opening failed:", err);
    return { ran: false };
  } finally {
    await releaseTurnLock(sessionId);
  }
}
