import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  hashUserIdForAnalytics,
  logServerAnalyticsEvent,
} from "@/lib/analytics/server-events";
import { ApiError } from "@/lib/api/errors";
import { isPlayRomanaModuleKey } from "@/lib/ai/narrative-session-profile";
import { db } from "@/lib/db";
import { worldLikes, worlds } from "@/lib/db/schema";
import { ROMA_MODULES } from "@/lib/rome/modules";
import { ROMA_SEEDS } from "@/lib/rome/seeder";
import { CampaignModeSchema } from "@/lib/schemas/enums";
import type { CampaignMode, SessionMode } from "@/lib/schemas/enums";
import { createSession } from "@/server/services/session-service";

export type WorldRow = typeof worlds.$inferSelect;

export type WorldCardDto = {
  slug: string;
  title: string;
  subtitle: string | null;
  /** Short hook on cards; falls back to subtitle in UI when null. */
  cardTeaser: string | null;
  sortOrder: number;
  isFeatured: boolean;
  forkCount: number;
  likeCount: number;
  tags: string[];
  coverImageUrl: string | null;
  coverImageAlt: string | null;
};

export type WorldLaneDto = {
  id: string;
  title: string;
  worlds: WorldCardDto[];
};

export type WorldDetailDto = WorldCardDto & {
  description: string | null;
  moduleKey: string | null;
  /** Present when the request had a signed-in user. */
  liked?: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function resolveCampaignMode(row: WorldRow): CampaignMode {
  const raw = row.campaign_mode_default?.trim();
  if (raw) {
    const parsed = CampaignModeSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  if (row.module_key?.trim()) return "module";
  return "user_prompt";
}

function snapshotTags(row: WorldRow): string[] {
  const def = row.snapshot_definition;
  if (!def || typeof def !== "object") return [];
  const tags = (def as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t)).filter(Boolean);
}

function snapshotStringField(
  row: WorldRow,
  key: "world_bible" | "art_direction" | "adventure_prompt",
): string | undefined {
  const def = row.snapshot_definition;
  if (!def || typeof def !== "object") return undefined;
  const v = (def as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Immutable JSON pinned on the session at fork: catalog fields + optional Roma seed merge.
 */
export function buildImmutableWorldSnapshot(row: WorldRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    worldId: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    card_teaser: row.card_teaser,
    description: row.description,
    cover_image_url: row.cover_image_url,
    cover_image_alt: row.cover_image_alt,
    module_key: row.module_key,
    campaign_mode_default: row.campaign_mode_default,
    published_revision: row.published_revision,
    snapshot_definition: row.snapshot_definition ?? {},
  };
  const mk = row.module_key?.trim() ?? null;
  if (mk && isPlayRomanaModuleKey(mk)) {
    base.roma_seed = ROMA_SEEDS[mk];
  }
  return base;
}

export function buildCreateSessionParamsFromWorld(
  row: WorldRow,
  hostUserId: string,
  overrides: {
    mode?: SessionMode;
    maxPlayers?: number;
    acquisitionSource?: string;
  },
): Parameters<typeof createSession>[0] {
  const campaignMode = resolveCampaignMode(row);
  const moduleKey =
    campaignMode === "module" ? row.module_key?.trim() || undefined : undefined;
  const tags = snapshotTags(row);

  let adventurePrompt: string | undefined;
  if (campaignMode === "module" && moduleKey && isPlayRomanaModuleKey(moduleKey)) {
    adventurePrompt = ROMA_SEEDS[moduleKey].theme;
  } else if (campaignMode === "user_prompt") {
    adventurePrompt =
      snapshotStringField(row, "adventure_prompt") ??
      row.description?.trim() ??
      undefined;
  }

  const worldBible = snapshotStringField(row, "world_bible");
  let artDirection = snapshotStringField(row, "art_direction");
  if (!artDirection && moduleKey && isPlayRomanaModuleKey(moduleKey)) {
    const v = ROMA_SEEDS[moduleKey].visualBibleSeed;
    artDirection = `${v.palette} — ${v.motifs}`;
  }

  const maxPlayers =
    overrides.maxPlayers ??
    row.default_max_players ??
    4;

  return {
    hostUserId,
    mode: overrides.mode ?? "ai_dm",
    campaignMode,
    maxPlayers,
    gameKind: "campaign",
    moduleKey,
    adventurePrompt,
    adventureTags: tags.length ? tags : undefined,
    artDirection,
    worldBible,
    acquisitionSource: overrides.acquisitionSource,
  };
}

async function countLikesByWorldIds(worldIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (worldIds.length === 0) return map;
  const agg = await db
    .select({
      world_id: worldLikes.world_id,
      n: sql<number>`count(*)::int`,
    })
    .from(worldLikes)
    .where(inArray(worldLikes.world_id, worldIds))
    .groupBy(worldLikes.world_id);
  for (const row of agg) {
    map.set(row.world_id, Number(row.n));
  }
  return map;
}

const ROMA_SLUG_SET = new Set(
  ROMA_MODULES.map((m) => m.key.replace(/_/g, "-")),
);

function rowToWorldCardDto(
  row: WorldRow,
  likeMap: Map<string, number>,
): WorldCardDto {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    cardTeaser: row.card_teaser,
    sortOrder: row.sort_order,
    isFeatured: row.is_featured,
    forkCount: row.fork_count,
    likeCount: likeMap.get(row.id) ?? 0,
    tags: snapshotTags(row),
    coverImageUrl: row.cover_image_url,
    coverImageAlt: row.cover_image_alt,
  };
}

function buildStaticLanes(cards: WorldCardDto[]): WorldLaneDto[] {
  const featured = cards.filter((c) => c.isFeatured);
  const staffWorlds =
    featured.length > 0 ? featured : cards.slice(0, Math.min(3, cards.length));
  const rome = cards.filter((c) => ROMA_SLUG_SET.has(c.slug));
  const popular = [...cards]
    .sort((a, b) => b.forkCount - a.forkCount)
    .slice(0, 6);
  const lanes: WorldLaneDto[] = [];
  if (staffWorlds.length > 0) {
    lanes.push({ id: "staff", title: "Staff picks", worlds: staffWorlds });
  }
  if (rome.length > 0) {
    lanes.push({ id: "rome", title: "Ancient Rome", worlds: rome });
  }
  if (popular.length > 0) {
    lanes.push({ id: "popular", title: "Popular now", worlds: popular });
  }
  return lanes;
}

async function loadPublishedWorldRows(): Promise<WorldRow[]> {
  return db
    .select()
    .from(worlds)
    .where(eq(worlds.status, "published"))
    .orderBy(desc(worlds.is_featured), asc(worlds.sort_order), asc(worlds.title));
}

/** Gallery API: full card list plus curated horizontal lanes. */
export async function getPublishedWorldsGalleryData(): Promise<{
  worlds: WorldCardDto[];
  lanes: WorldLaneDto[];
}> {
  const rows = await loadPublishedWorldRows();
  const likeMap = await countLikesByWorldIds(rows.map((r) => r.id));
  const cards = rows.map((r) => rowToWorldCardDto(r, likeMap));
  return { worlds: cards, lanes: buildStaticLanes(cards) };
}

export async function getWorldLikeCount(worldId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(worldLikes)
    .where(eq(worldLikes.world_id, worldId));
  return Number(row?.n ?? 0);
}

export async function userLikesWorld(
  userId: string,
  worldId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: worldLikes.id })
    .from(worldLikes)
    .where(
      and(eq(worldLikes.user_id, userId), eq(worldLikes.world_id, worldId)),
    )
    .limit(1);
  return Boolean(row);
}

export async function addWorldLike(params: {
  userId: string;
  worldId: string;
}): Promise<void> {
  await db
    .insert(worldLikes)
    .values({
      user_id: params.userId,
      world_id: params.worldId,
    })
    .onConflictDoNothing({
      target: [worldLikes.user_id, worldLikes.world_id],
    });
}

export async function removeWorldLike(params: {
  userId: string;
  worldId: string;
}): Promise<void> {
  await db
    .delete(worldLikes)
    .where(
      and(
        eq(worldLikes.user_id, params.userId),
        eq(worldLikes.world_id, params.worldId),
      ),
    );
}

async function incrementWorldForkCount(worldId: string): Promise<void> {
  await db
    .update(worlds)
    .set({
      fork_count: sql`${worlds.fork_count} + 1`,
      updated_at: new Date(),
    })
    .where(eq(worlds.id, worldId));
}

export async function listPublishedWorlds(): Promise<WorldCardDto[]> {
  const { worlds: cards } = await getPublishedWorldsGalleryData();
  return cards;
}

export async function getPublishedWorldBySlug(
  slug: string,
): Promise<WorldRow | null> {
  const [row] = await db
    .select()
    .from(worlds)
    .where(and(eq(worlds.slug, slug), eq(worlds.status, "published")))
    .limit(1);
  return row ?? null;
}

export async function getPublishedWorldById(id: string): Promise<WorldRow | null> {
  const [row] = await db
    .select()
    .from(worlds)
    .where(and(eq(worlds.id, id), eq(worlds.status, "published")))
    .limit(1);
  return row ?? null;
}

/** Resolve a published world by UUID id or URL slug. */
export async function getPublishedWorldByIdOrSlug(
  worldIdOrSlug: string,
): Promise<WorldRow | null> {
  const key = worldIdOrSlug.trim();
  if (!key) return null;
  if (isUuid(key)) {
    return getPublishedWorldById(key);
  }
  return getPublishedWorldBySlug(key);
}

export function worldRowToDetailDto(
  row: WorldRow,
  extras?: { likeCount?: number; liked?: boolean },
): WorldDetailDto {
  const likeCount = extras?.likeCount ?? 0;
  const likeMap = new Map<string, number>([[row.id, likeCount]]);
  const base = rowToWorldCardDto(row, likeMap);
  return {
    ...base,
    likeCount,
    liked: extras?.liked,
    description: row.description,
    moduleKey: row.module_key,
  };
}

export async function forkWorldToSession(params: {
  worldIdOrSlug: string;
  hostUserId: string;
  mode?: SessionMode;
  maxPlayers?: number;
  acquisitionSource?: string;
}): Promise<{ sessionId: string; joinCode: string }> {
  const world = await getPublishedWorldByIdOrSlug(params.worldIdOrSlug);
  if (!world) {
    throw new ForkWorldError("World not found", 404);
  }

  const createParams = buildCreateSessionParamsFromWorld(
    world,
    params.hostUserId,
    {
      mode: params.mode,
      maxPlayers: params.maxPlayers,
      acquisitionSource: params.acquisitionSource ?? "worlds_gallery_fork",
    },
  );

  const snapshot = buildImmutableWorldSnapshot(world);

  const result = await createSession({
    ...createParams,
    worldFork: {
      worldId: world.id,
      revision: world.published_revision,
      snapshot,
    },
  });

  logServerAnalyticsEvent("world_forked", {
    world_id: world.id,
    revision: world.published_revision,
    user_id_hash: hashUserIdForAnalytics(params.hostUserId),
  });

  try {
    await incrementWorldForkCount(world.id);
  } catch (e) {
    console.error("incrementWorldForkCount failed", e);
  }

  return result;
}

export class ForkWorldError extends ApiError {
  constructor(message: string, status: 404 | 400 = 404) {
    super(message, status);
    this.name = "ForkWorldError";
  }
}

export const WorldSlugParamSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase alphanumeric segments separated by hyphens",
  );

/** Ops / Metabase: all catalog rows with aggregate like counts. */
export async function listWorldsMetricsRows(): Promise<
  Array<{
    slug: string;
    title: string;
    status: string;
    isFeatured: boolean;
    forkCount: number;
    likeCount: number;
    ugcReviewStatus: string;
    isUserSubmitted: boolean;
  }>
> {
  const wRows = await db
    .select({
      id: worlds.id,
      slug: worlds.slug,
      title: worlds.title,
      status: worlds.status,
      is_featured: worlds.is_featured,
      fork_count: worlds.fork_count,
      ugc_review_status: worlds.ugc_review_status,
      created_by_user_id: worlds.created_by_user_id,
    })
    .from(worlds)
    .orderBy(asc(worlds.sort_order), asc(worlds.title));

  const likeMap = await countLikesByWorldIds(wRows.map((r) => r.id));

  return wRows.map((r) => ({
    slug: r.slug,
    title: r.title,
    status: r.status,
    isFeatured: r.is_featured,
    forkCount: r.fork_count,
    likeCount: likeMap.get(r.id) ?? 0,
    ugcReviewStatus: r.ugc_review_status,
    isUserSubmitted: r.created_by_user_id != null,
  }));
}
