import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import { generateSceneImage } from "@/lib/ai/image-provider";
import {
  buildOpenRouterSceneSystemPrompt,
} from "@/lib/ai/narrative-session-profile";
import { generateSceneImageOpenRouter } from "@/lib/ai/openrouter-image-provider";
import { isCustomClassesEnabled } from "@/lib/config/features";
import { db } from "@/lib/db";
import {
  characters,
  imageJobs,
  npcStates,
  players,
  sceneSnapshots,
  sessions,
} from "@/lib/db/schema";
import { logTrace } from "@/lib/orchestrator/trace";
import { ClassProfileSchema } from "@/lib/schemas/domain";
import {
  isSceneImageObjectStorageConfigured,
  uploadSceneImageBytes,
} from "@/lib/storage/scene-image-storage";

const STYLE_PROFILES = {
  /** Sword-and-sorcery / mythic adventure keywords only — not the global default. */
  fantasy: {
    keywords: ["fantasy", "medieval", "knight", "arcane", "dragon", "paladin", "sorcerer"],
    style: [
      "painted fantasy and adventure illustration",
      "cohesive palette with clear focal lighting (warm torchlight, jewel tones, or open sky as fits the scene)",
      "detailed painterly brushwork",
      "heroic adventure atmosphere aligned to the described setting, not a fixed medieval default",
      "cinematic composition, readable silhouettes, atmospheric depth",
    ],
    negative: ["futuristic tech", "holograms", "cybernetic implants", "sci-fi UI"],
  },
  cyberpunk: {
    keywords: ["cyberpunk", "neon", "megacity", "futuristic", "chrome", "android", "cyborg"],
    style: [
      "cyberpunk concept art",
      "neon edge lighting with deep contrast",
      "rain-slick streets and holographic ambience",
      "futuristic city architecture",
      "cinematic dramatic lighting",
      "rich atmospheric perspective",
    ],
    negative: ["medieval armor tropes", "castle spires and heraldic fantasy", "parchment textures"],
  },
  postApoc: {
    keywords: ["wasteland", "post-apoc", "post apoc", "ruins", "survival", "mutant", "desolation"],
    style: [
      "post-apocalyptic concept art",
      "dust-laden atmosphere and weathered metal",
      "high-contrast survival aesthetics",
      "environmental storytelling through ruins",
    ],
    negative: ["clean utopian skyline", "bright polished palace or storybook castle imagery"],
  },
  noir: {
    keywords: ["noir", "detective", "gritty", "rain", "smoke", "crime", "alley"],
    style: [
      "neo-noir cinematic illustration",
      "high contrast shadows and practical light sources",
      "moody rain and atmospheric fog",
    ],
    negative: ["high-saturation cartoon palette"],
  },
  horror: {
    keywords: ["horror", "eldritch", "haunted", "dread", "occult", "nightmare", "grotesque"],
    style: [
      "atmospheric horror concept art",
      "oppressive shadows and unsettling silhouettes",
      "tense visual composition with ominous contrast",
    ],
    negative: ["cheerful whimsical tones", "cute chibi proportions"],
  },
  steampunk: {
    keywords: ["steampunk", "clockwork", "brass", "gearwork", "airship", "victorian"],
    style: [
      "steampunk illustration style",
      "brass machinery and smoke-laced atmosphere",
      "ornate industrial-victorian details",
    ],
    negative: ["ultra-modern minimal sci-fi UI"],
  },
} as const;

type StyleProfileKey = keyof typeof STYLE_PROFILES;

function buildStylePack(themeHint: string): {
  style: string;
  negatives: string[];
  selected: StyleProfileKey[];
} {
  const normalized = themeHint.toLowerCase();
  const scored = (Object.entries(STYLE_PROFILES) as Array<[StyleProfileKey, (typeof STYLE_PROFILES)[StyleProfileKey]]>)
    .map(([key, profile]) => ({
      key,
      score: profile.keywords.reduce((sum, kw) => sum + (normalized.includes(kw) ? 1 : 0), 0),
      profile,
    }))
    .sort((a, b) => b.score - a.score);

  const chosen = scored.filter((x) => x.score > 0).slice(0, 2);
  if (chosen.length === 0) {
    const style = [
      "cinematic wide-format illustration",
      "cohesive lighting and palette suited to the scene",
      "atmospheric depth, readable composition",
    ].join(", ");
    const negatives = ["text overlay", "watermark", "UI elements", "subtitles"];
    return { style, negatives, selected: [] };
  }
  const style = chosen.flatMap((c) => c.profile.style).join(", ");
  const negatives = [...new Set(chosen.flatMap((c) => c.profile.negative))];
  const selected = chosen.map((x) => x.key);
  return { style, negatives, selected };
}

function normalizeAndSort(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean).map((v) => v.toLowerCase()))].sort((a, b) =>
    a.localeCompare(b),
  );
}

type StyleArbitrationInput = {
  sessionThemeStyle: string;
  classVisualTags: string[];
  classConcepts: string[];
  turnHint?: {
    environment?: string;
    mood?: string;
  };
};

export function buildArbitratedStyleDirectives(params: StyleArbitrationInput): {
  orderedStyleDirectives: string[];
  policyLine: string;
} {
  const classTags = normalizeAndSort(params.classVisualTags);
  const classConcepts = normalizeAndSort(params.classConcepts);
  const turnHintDirectives = normalizeAndSort([
    params.turnHint?.environment ?? "",
    params.turnHint?.mood ?? "",
  ]);

  // Deterministic priority: session theme > class tags/concepts > turn hints.
  const orderedStyleDirectives = [
    `Session theme (highest priority): ${params.sessionThemeStyle}`,
    classTags.length > 0
      ? `Class visual tags (secondary): ${classTags.join(", ")}`
      : "",
    classConcepts.length > 0
      ? `Class concepts (secondary): ${classConcepts.join(", ")}`
      : "",
    turnHintDirectives.length > 0
      ? `Turn hint details (tertiary): ${turnHintDirectives.join(", ")}`
      : "",
  ].filter(Boolean);

  return {
    orderedStyleDirectives,
    policyLine:
      "Style arbitration policy: session theme has final authority. Class tags and class concepts may refine details but must not override session theme. Turn hints are tertiary and may only adjust moment-level mood/framing.",
  };
}

const NEGATIVE_BASE = [
  "text",
  "watermark",
  "UI",
  "HUD",
  "speech bubbles",
  "blurry",
  "low quality",
  "anime",
  "cartoon",
  "chibi",
];

function buildNegativePrompt(params: {
  negatives: string[];
  imageHintAvoid?: string[];
}): string {
  const avoid = params.imageHintAvoid?.filter(Boolean) ?? [];
  return [...NEGATIVE_BASE, ...params.negatives, ...avoid].join(", ");
}

async function fetchPartyDescriptions(sessionId: string): Promise<{
  partyDescription: string;
  visualTags: string[];
  classConcepts: string[];
}> {
  const customClassesEnabled = isCustomClassesEnabled();
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

  if (rows.length === 0) {
    return {
      partyDescription: "a party of adventurers",
      visualTags: [],
      classConcepts: [],
    };
  }

  const allTags: string[] = [];
  const allConcepts: string[] = [];

  const partyDescription = rows
    .map((r) => {
      const vp = (r.visual_profile ?? {}) as Record<string, unknown>;
      const traits = Array.isArray(vp.traits) ? vp.traits.map(String).join(", ") : "";
      const parsedProfile = ClassProfileSchema.safeParse(vp.class_profile);
      const canUseProfile = customClassesEnabled && parsedProfile.success;
      const classLabel = canUseProfile
        ? parsedProfile.data.display_name
        : `${r.race} ${r.class}`;
      if (canUseProfile && parsedProfile.data.visual_tags.length > 0) {
        allTags.push(...parsedProfile.data.visual_tags);
      }
      if (canUseProfile && parsedProfile.data.concept_prompt.trim()) {
        allConcepts.push(parsedProfile.data.concept_prompt.trim());
      } else if (canUseProfile && parsedProfile.data.fantasy.trim()) {
        allConcepts.push(parsedProfile.data.fantasy.trim());
      }
      const base = `${r.name} (${classLabel})`;
      return traits ? `${base} [${traits}]` : base;
    })
    .join(", ");

  return {
    partyDescription,
    visualTags: [...new Set(allTags.map((t) => t.trim()).filter(Boolean))].slice(0, 12),
    classConcepts: [...new Set(allConcepts)].slice(0, 6),
  };
}

function buildPrompt(params: {
  narrativeText: string;
  sceneContext: string;
  partyDescription: string;
  stylePack: string;
  styleNegatives: string[];
  partyVisualTags: string[];
  classConcepts: string[];
  previousPrompt: string | null;
  imageHint?: {
    subjects?: string[];
    environment?: string;
    mood?: string;
    avoid?: string[];
  };
}): { prompt: string; negativePrompt: string } {
  const {
    narrativeText,
    sceneContext,
    partyDescription,
    stylePack,
    partyVisualTags,
    classConcepts,
    previousPrompt,
    imageHint,
  } = params;

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
  const partyStyleLine = partyVisualTags.length
    ? `Character anchors: ${partyVisualTags.join(", ")}.`
    : "";
  const classConceptLine = classConcepts.length
    ? `Class concepts to respect: ${classConcepts.join("; ")}.`
    : "";
  const styleArbitration = buildArbitratedStyleDirectives({
    sessionThemeStyle: stylePack,
    classVisualTags: partyVisualTags,
    classConcepts,
    turnHint: {
      environment: imageHint?.environment,
      mood: imageHint?.mood,
    },
  });
  const styleDirectiveLine = `Art style directives (ordered): ${styleArbitration.orderedStyleDirectives.join(" | ")}.`;

  const prompt = [
    styleDirectiveLine,
    styleArbitration.policyLine,
    `Scene: ${scene}`,
    `Current moment: ${action}`,
    subjectLine,
    envLine,
    moodLine,
    partyStyleLine,
    classConceptLine,
    `Characters present: ${partyDescription}.`,
    continuityHint,
    `Keep character appearances consistent. Wide cinematic composition, 16:9 aspect ratio, no text or UI overlays.`,
  ].filter(Boolean).join("\n");

  const negativePrompt = buildNegativePrompt({
    negatives: params.styleNegatives,
    imageHintAvoid: imageHint?.avoid,
  });

  return { prompt, negativePrompt };
}

export async function runImagePipeline(params: {
  sessionId: string;
  /** Party / internal jobs have no RPG turn — use `null` so traces do not violate `turns` FK. */
  turnId: string | null;
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

  const { partyDescription, visualTags, classConcepts } = await fetchPartyDescriptions(sessionId);

  const [sessionRow] = await db
    .select({
      id: sessions.id,
      campaign_mode: sessions.campaign_mode,
      module_key: sessions.module_key,
      campaign_title: sessions.campaign_title,
      adventure_prompt: sessions.adventure_prompt,
      adventure_tags: sessions.adventure_tags,
      art_direction: sessions.art_direction,
      world_bible: sessions.world_bible,
      tone: sessions.tone,
      style_policy: sessions.style_policy,
      current_round: sessions.current_round,
      state_version: sessions.state_version,
    })
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

  const tagRaw = sessionRow.adventure_tags;
  const narrativeForImage = {
    campaign_mode: sessionRow.campaign_mode,
    module_key: sessionRow.module_key,
    adventure_prompt: sessionRow.adventure_prompt,
    adventure_tags: Array.isArray(tagRaw) ? tagRaw.map(String) : null,
    art_direction: sessionRow.art_direction,
    world_bible: sessionRow.world_bible,
  };
  const styleHint = [
    sessionRow.campaign_title,
    sessionRow.adventure_prompt,
    sessionRow.tone,
    sessionRow.style_policy,
    sessionRow.art_direction,
    ...(Array.isArray(tagRaw) ? tagRaw.map(String) : []),
  ]
    .filter(Boolean)
    .join(" ");
  const stylePack = buildStylePack(styleHint);

  const [prevSnap] = await db
    .select({
      image_prompt: sceneSnapshots.image_prompt,
      summary: sceneSnapshots.summary,
    })
    .from(sceneSnapshots)
    .where(eq(sceneSnapshots.session_id, sessionId))
    .orderBy(desc(sceneSnapshots.created_at))
    .limit(1);

  const { prompt: composedPrompt, negativePrompt: composedNegative } = buildPrompt({
    narrativeText,
    sceneContext,
    partyDescription,
    stylePack: stylePack.style,
    styleNegatives: stylePack.negatives,
    partyVisualTags: visualTags,
    classConcepts,
    previousPrompt: prevSnap?.image_prompt ?? null,
    imageHint,
  });

  const tStart = Date.now();
  let base64 = "";
  let generatedBy: "openrouter" | "fal_fallback" | null = null;
  try {
    const out = await generateSceneImageOpenRouter({
      prompt: composedPrompt,
      negativePrompt: composedNegative,
      systemPrompt: buildOpenRouterSceneSystemPrompt(narrativeForImage),
    });
    base64 = out.base64;
    generatedBy = "openrouter";
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
    try {
      const falOut = await generateSceneImage({
        prompt: composedPrompt,
        negativePrompt: composedNegative,
        width: 1024,
        height: 576,
      });
      const falRes = await fetch(falOut.imageUrl);
      if (!falRes.ok) {
        throw new Error(`FAL image fetch failed ${falRes.status}`);
      }
      const falArr = await falRes.arrayBuffer();
      base64 = Buffer.from(falArr).toString("base64");
      generatedBy = "fal_fallback";
      await logTrace({
        sessionId,
        turnId,
        stepName: "scene_image_fal_fallback",
        input: { prompt_prefix: composedPrompt.slice(0, 120) },
        output: { has_data: true },
        modelUsed: "fal-ai/fast-sdxl",
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - tStart,
        success: true,
      });
    } catch (fallbackErr) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      await logTrace({
        sessionId,
        turnId,
        stepName: "scene_image_fal_fallback",
        input: { prompt_prefix: composedPrompt.slice(0, 120) },
        output: {},
        modelUsed: "fal-ai/fast-sdxl",
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - tStart,
        success: false,
        errorMessage: fallbackMsg,
      });
      return { imageUrl: null };
    }
  }

  if (generatedBy === "openrouter") {
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
  }

  const summary =
    prevSnap?.summary?.trim() ||
    sceneContext.trim().slice(0, 4000) ||
    narrativeText.slice(0, 500);

  const snapId = randomUUID();
  const imageBytes = Buffer.from(base64, "base64");
  let imageUrlForRow: string;
  if (isSceneImageObjectStorageConfigured()) {
    try {
      const key = `sessions/${sessionId}/scenes/${snapId}.png`;
      imageUrlForRow = await uploadSceneImageBytes({
        key,
        body: imageBytes,
        contentType: "image/png",
      });
    } catch (err) {
      console.error("[image] R2 upload failed, falling back to inline data URL:", err);
      imageUrlForRow = `data:image/png;base64,${base64}`;
    }
  } else {
    imageUrlForRow = `data:image/png;base64,${base64}`;
  }

  try {
    const [snap] = await db
      .insert(sceneSnapshots)
      .values({
        id: snapId,
        session_id: sessionId,
        round_number: sessionRow.current_round,
        state_version: sessionRow.state_version,
        summary,
        image_status: "ready",
        image_prompt: composedPrompt,
        image_url: imageUrlForRow,
      })
      .returning();

    const servingUrl = `/api/sessions/${sessionId}/scene-image/${snap!.id}`;

    // Unlock NPC portraits progressively when they become relevant in narration.
    try {
      const npcRows = await db
        .select({ id: npcStates.id, name: npcStates.name, visual_profile: npcStates.visual_profile })
        .from(npcStates)
        .where(eq(npcStates.session_id, sessionId));
      const textForMatch = `${narrativeText}\n${sceneContext}`.toLowerCase();
      for (const npc of npcRows) {
        const name = npc.name.trim();
        if (!name) continue;
        if (!textForMatch.includes(name.toLowerCase())) continue;
        const rawVp = npc.visual_profile;
        const vp =
          rawVp && typeof rawVp === "object" && !Array.isArray(rawVp)
            ? (rawVp as Record<string, unknown>)
            : {};
        const nextVp: Record<string, unknown> = {
          ...vp,
          portrait_url: servingUrl,
          portrait_status: "ready",
        };
        await db
          .update(npcStates)
          .set({ visual_profile: nextVp, updated_at: new Date() })
          .where(eq(npcStates.id, npc.id));
      }
    } catch (err) {
      console.error("[image] npc portrait unlock update failed:", err);
    }

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
