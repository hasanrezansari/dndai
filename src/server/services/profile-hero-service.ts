import { and, count, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { profileHeroes, userProfileSettings } from "@/lib/db/schema";
import { CharacterStatsSchema, ClassProfileSchema } from "@/lib/schemas/domain";
import type { CharacterStats, ClassProfile } from "@/lib/schemas/domain";
import { createCharacter } from "@/server/services/character-service";

export const FREE_PROFILE_HERO_SLOTS = 1 as const;

export type ProfileHero = {
  id: string;
  userId: string;
  name: string;
  heroClass: string;
  race: string;
  statsTemplate: CharacterStats | null;
  abilitiesTemplate: unknown[];
  visualProfile: Record<string, unknown>;
  portraitUrl?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: typeof profileHeroes.$inferSelect): ProfileHero {
  const statsParsed = CharacterStatsSchema.safeParse(row.stats_template);
  const visualProfile =
    row.visual_profile && typeof row.visual_profile === "object" && !Array.isArray(row.visual_profile)
      ? (row.visual_profile as Record<string, unknown>)
      : {};
  const portraitRaw = visualProfile.portrait_url;
  const portraitUrl =
    typeof portraitRaw === "string" && portraitRaw.trim().length > 0
      ? portraitRaw.trim()
      : undefined;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    heroClass: row.hero_class,
    race: row.race,
    statsTemplate: statsParsed.success ? statsParsed.data : null,
    abilitiesTemplate: Array.isArray(row.abilities_template)
      ? (row.abilities_template as unknown[])
      : [],
    visualProfile,
    portraitUrl,
    isPublic: Boolean(row.is_public),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getOrCreateProfileSettings(userId: string): Promise<{
  publicProfileEnabled: boolean;
  freePortraitUses: number;
}> {
  const [row] = await db
    .select()
    .from(userProfileSettings)
    .where(eq(userProfileSettings.user_id, userId))
    .limit(1);
  if (row) {
    return {
      publicProfileEnabled: row.public_profile_enabled,
      freePortraitUses: row.free_portrait_uses ?? 0,
    };
  }
  const [created] = await db
    .insert(userProfileSettings)
    .values({ user_id: userId, public_profile_enabled: false, free_portrait_uses: 0 })
    .returning();
  return {
    publicProfileEnabled: created?.public_profile_enabled ?? false,
    freePortraitUses: created?.free_portrait_uses ?? 0,
  };
}

export async function setPublicProfileEnabled(userId: string, enabled: boolean) {
  await db
    .insert(userProfileSettings)
    .values({
      user_id: userId,
      public_profile_enabled: enabled,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: userProfileSettings.user_id,
      set: { public_profile_enabled: enabled, updated_at: new Date() },
    });
}

export class PortraitPaymentRequiredError extends Error {
  constructor() {
    super("Portrait generation costs Sparks");
    this.name = "PortraitPaymentRequiredError";
  }
}

/**
 * Guardrail for image costs:
 * - Each user gets 1 free AI portrait generation total (v0).
 * - After that, callers should route through Sparks wallet before retrying.
 */
export async function assertAndConsumeFreePortraitUse(userId: string) {
  const settings = await getOrCreateProfileSettings(userId);
  if (settings.freePortraitUses >= 1) {
    throw new PortraitPaymentRequiredError();
  }
  await db
    .update(userProfileSettings)
    .set({
      free_portrait_uses: settings.freePortraitUses + 1,
      updated_at: new Date(),
    })
    .where(eq(userProfileSettings.user_id, userId));
}

export async function countProfileHeroSlotsUsed(userId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(profileHeroes)
    .where(eq(profileHeroes.user_id, userId));
  return Number(rows[0]?.value ?? 0);
}

export async function listProfileHeroesForUser(userId: string): Promise<ProfileHero[]> {
  const rows = await db
    .select()
    .from(profileHeroes)
    .where(eq(profileHeroes.user_id, userId))
    .orderBy(desc(profileHeroes.updated_at));
  return rows.map(mapRow);
}

export async function getProfileHeroForUser(params: {
  userId: string;
  heroId: string;
}): Promise<ProfileHero | null> {
  const [row] = await db
    .select()
    .from(profileHeroes)
    .where(and(eq(profileHeroes.user_id, params.userId), eq(profileHeroes.id, params.heroId)))
    .limit(1);
  return row ? mapRow(row) : null;
}

export class ProfileHeroSlotLimitError extends Error {
  constructor() {
    super("Profile hero slot limit reached");
    this.name = "ProfileHeroSlotLimitError";
  }
}

export async function upsertSingleProfileHero(params: {
  userId: string;
  name: string;
  heroClass: string;
  race: string;
  statsTemplate?: CharacterStats | null;
  abilitiesTemplate?: unknown[];
  visualProfile?: Record<string, unknown>;
  isPublic?: boolean;
}): Promise<ProfileHero> {
  const used = await countProfileHeroSlotsUsed(params.userId);
  if (used >= FREE_PROFILE_HERO_SLOTS) {
    // For v1 we only allow replacing via delete, not auto-overwrite.
    throw new ProfileHeroSlotLimitError();
  }

  const [created] = await db
    .insert(profileHeroes)
    .values({
      user_id: params.userId,
      name: params.name.trim(),
      hero_class: params.heroClass.trim().toLowerCase(),
      race: params.race.trim().toLowerCase(),
      stats_template: params.statsTemplate ?? {},
      abilities_template: Array.isArray(params.abilitiesTemplate) ? params.abilitiesTemplate : [],
      visual_profile: params.visualProfile ?? {},
      is_public: Boolean(params.isPublic),
      updated_at: new Date(),
    })
    .returning();
  if (!created) throw new Error("Failed to create profile hero");
  return mapRow(created);
}

export async function deleteProfileHero(params: { userId: string; heroId: string }) {
  await db
    .delete(profileHeroes)
    .where(and(eq(profileHeroes.user_id, params.userId), eq(profileHeroes.id, params.heroId)));
}

export async function setHeroPublicFlag(params: { userId: string; heroId: string; isPublic: boolean }) {
  const [row] = await db
    .update(profileHeroes)
    .set({ is_public: params.isPublic, updated_at: new Date() })
    .where(and(eq(profileHeroes.user_id, params.userId), eq(profileHeroes.id, params.heroId)))
    .returning();
  return row ? mapRow(row) : null;
}

export class PublicProfileDisabledError extends Error {
  constructor() {
    super("Public profile disabled");
    this.name = "PublicProfileDisabledError";
  }
}

export async function copyPublicHeroToUser(params: {
  viewerUserId: string;
  fromHeroId: string;
}): Promise<ProfileHero> {
  const used = await countProfileHeroSlotsUsed(params.viewerUserId);
  if (used >= FREE_PROFILE_HERO_SLOTS) {
    throw new ProfileHeroSlotLimitError();
  }

  const [src] = await db
    .select({
      hero: profileHeroes,
      publicEnabled: userProfileSettings.public_profile_enabled,
    })
    .from(profileHeroes)
    .leftJoin(
      userProfileSettings,
      eq(userProfileSettings.user_id, profileHeroes.user_id),
    )
    .where(eq(profileHeroes.id, params.fromHeroId))
    .limit(1);

  const heroRow = src?.hero;
  const publicEnabled = Boolean(src?.publicEnabled);
  if (!heroRow || !heroRow.is_public) {
    throw new Error("Hero not found");
  }
  if (!publicEnabled) {
    throw new PublicProfileDisabledError();
  }

  const [created] = await db
    .insert(profileHeroes)
    .values({
      user_id: params.viewerUserId,
      name: heroRow.name,
      hero_class: heroRow.hero_class,
      race: heroRow.race,
      stats_template: heroRow.stats_template as Record<string, unknown>,
      abilities_template: heroRow.abilities_template as unknown[],
      visual_profile: heroRow.visual_profile as Record<string, unknown>,
      is_public: false,
      updated_at: new Date(),
    })
    .returning();
  if (!created) throw new Error("Failed to copy hero");
  return mapRow(created);
}

export async function instantiateProfileHeroIntoSession(params: {
  userId: string;
  heroId: string;
  sessionId: string;
  playerId: string;
  // v1: allow rerolling stats per adventure while keeping build/identity stable
  statsOverride?: CharacterStats | null;
}): Promise<{ characterId: string }> {
  const hero = await getProfileHeroForUser({ userId: params.userId, heroId: params.heroId });
  if (!hero) throw new Error("Hero not found");

  const vp = hero.visualProfile;
  const classProfileParsed = ClassProfileSchema.safeParse(vp.class_profile);
  const classProfile: ClassProfile | undefined =
    classProfileParsed.success ? classProfileParsed.data : undefined;

  const stats =
    params.statsOverride ??
    hero.statsTemplate ??
    // If no template stats, force caller to provide stats (or use existing roll-stats flow).
    null;
  if (!stats) throw new Error("Missing stats");

  const portraitRaw = vp.portrait_url;
  const portraitUrl =
    typeof portraitRaw === "string" && portraitRaw.trim().length > 0
      ? portraitRaw.trim()
      : undefined;

  const res = await createCharacter({
    playerId: params.playerId,
    sessionId: params.sessionId,
    name: hero.name,
    characterClass: hero.heroClass,
    race: hero.race,
    stats,
    portraitUrl,
    pronouns: typeof vp.pronouns === "string" ? vp.pronouns : undefined,
    traits: Array.isArray(vp.traits) ? vp.traits.map(String) : undefined,
    backstory: typeof vp.backstory === "string" ? vp.backstory : undefined,
    appearance: typeof vp.appearance === "string" ? vp.appearance : undefined,
    classProfile,
  });
  return res;
}

