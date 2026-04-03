import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, max, sql } from "drizzle-orm";
import { z } from "zod";

import {
  hashUserIdForAnalytics,
  logServerAnalyticsEvent,
} from "@/lib/analytics/server-events";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";

export const UGC_REVIEW_NONE = "none";
export const UGC_REVIEW_PENDING = "pending";
export const UGC_REVIEW_REJECTED = "rejected";

const MAX_PENDING_PER_USER = 5;

export const CreateWorldSubmissionBodySchema = z.object({
  title: z.string().trim().min(3).max(120),
  subtitle: z.string().trim().max(240).optional().nullable(),
  description: z.string().trim().min(20).max(8000),
  adventurePrompt: z.string().trim().max(8000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
  artDirection: z.string().trim().max(2000).optional().nullable(),
  worldBible: z.string().trim().max(16000).optional().nullable(),
  defaultMaxPlayers: z.number().int().min(1).max(8).optional().nullable(),
});

export type CreateWorldSubmissionInput = z.infer<
  typeof CreateWorldSubmissionBodySchema
>;

export class WorldSubmissionError extends ApiError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "WorldSubmissionError";
  }
}

function isGuestEmail(email: string | null): boolean {
  return Boolean(email?.endsWith("@ashveil.guest"));
}

/** Exported for unit tests — produces a slug segment from display title. */
export function slugBaseFromTitle(title: string): string {
  const raw = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return raw.length > 0 ? raw : "world";
}

async function worldSlugExists(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: worlds.id })
    .from(worlds)
    .where(eq(worlds.slug, slug))
    .limit(1);
  return Boolean(row);
}

async function allocateUniqueSubmissionSlug(title: string): Promise<string> {
  const base = slugBaseFromTitle(title);
  if (!(await worldSlugExists(base))) return base;
  for (let i = 0; i < 32; i++) {
    const suffix = randomBytes(3).toString("hex");
    const candidate = `${base}-${suffix}`;
    if (!(await worldSlugExists(candidate))) return candidate;
  }
  throw new WorldSubmissionError("Could not allocate a unique slug", 500);
}

export async function countUserPendingSubmissions(
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(worlds)
    .where(
      and(
        eq(worlds.created_by_user_id, userId),
        eq(worlds.ugc_review_status, UGC_REVIEW_PENDING),
      ),
    );
  return Number(row?.n ?? 0);
}

export type MyWorldSubmissionDto = {
  id: string;
  slug: string;
  title: string;
  status: string;
  ugcReviewStatus: string;
  submittedForReviewAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function createWorldSubmission(params: {
  userId: string;
  userEmail: string | null;
  body: unknown;
}): Promise<{ id: string; slug: string }> {
  if (isGuestEmail(params.userEmail)) {
    throw new WorldSubmissionError(
      "Sign in with Google to submit a world to the catalog",
      403,
    );
  }
  const pending = await countUserPendingSubmissions(params.userId);
  if (pending >= MAX_PENDING_PER_USER) {
    throw new WorldSubmissionError(
      "Too many worlds awaiting review. Wait for a decision before submitting more.",
      429,
    );
  }
  const parsed = CreateWorldSubmissionBodySchema.safeParse(params.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new WorldSubmissionError(msg || "Invalid request body", 400);
  }
  const b = parsed.data;
  const slug = await allocateUniqueSubmissionSlug(b.title);
  const now = new Date();
  const snapshot_definition: Record<string, unknown> = {
    tags: b.tags ?? [],
    adventure_prompt:
      b.adventurePrompt?.trim() || b.description.trim(),
    ...(b.artDirection?.trim()
      ? { art_direction: b.artDirection.trim() }
      : {}),
    ...(b.worldBible?.trim() ? { world_bible: b.worldBible.trim() } : {}),
  };
  const [row] = await db
    .insert(worlds)
    .values({
      slug,
      title: b.title.trim(),
      subtitle: b.subtitle?.trim() || null,
      card_teaser: b.subtitle?.trim() || null,
      description: b.description.trim(),
      status: "draft",
      sort_order: 9999,
      module_key: null,
      campaign_mode_default: "user_prompt",
      default_max_players: b.defaultMaxPlayers ?? 4,
      snapshot_definition,
      published_revision: 1,
      is_featured: false,
      fork_count: 0,
      cover_image_url: null,
      cover_image_alt: null,
      created_by_user_id: params.userId,
      submitted_for_review_at: now,
      ugc_review_status: UGC_REVIEW_PENDING,
      rejection_reason: null,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: worlds.id, slug: worlds.slug });
  if (!row) {
    throw new WorldSubmissionError("Could not create submission", 500);
  }
  logServerAnalyticsEvent("world_ugc_submitted", {
    world_id: row.id,
    user_id_hash: hashUserIdForAnalytics(params.userId),
  });
  return row;
}

export async function listMyWorldSubmissions(
  userId: string,
): Promise<MyWorldSubmissionDto[]> {
  const rows = await db
    .select()
    .from(worlds)
    .where(eq(worlds.created_by_user_id, userId))
    .orderBy(desc(worlds.updated_at));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status,
    ugcReviewStatus: r.ugc_review_status,
    submittedForReviewAt: r.submitted_for_review_at?.toISOString() ?? null,
    rejectionReason: r.rejection_reason,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export type PendingWorldSubmissionAdminRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  createdByUserId: string;
  submittedForReviewAt: string | null;
  snapshotDefinition: Record<string, unknown> | null;
};

export async function listPendingWorldSubmissions(): Promise<
  PendingWorldSubmissionAdminRow[]
> {
  const rows = await db
    .select({
      id: worlds.id,
      slug: worlds.slug,
      title: worlds.title,
      subtitle: worlds.subtitle,
      description: worlds.description,
      created_by_user_id: worlds.created_by_user_id,
      submitted_for_review_at: worlds.submitted_for_review_at,
      snapshot_definition: worlds.snapshot_definition,
    })
    .from(worlds)
    .where(eq(worlds.ugc_review_status, UGC_REVIEW_PENDING))
    .orderBy(asc(worlds.submitted_for_review_at));

  return rows
    .filter((r) => r.created_by_user_id != null)
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      subtitle: r.subtitle,
      description: r.description,
      createdByUserId: r.created_by_user_id!,
      submittedForReviewAt: r.submitted_for_review_at?.toISOString() ?? null,
      snapshotDefinition: r.snapshot_definition ?? null,
    }));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ModerateWorldSubmissionBodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectionReason: z.string().trim().max(500).optional().nullable(),
});

export async function moderateWorldSubmission(params: {
  worldId: string;
  action: "approve" | "reject";
  rejectionReason?: string | null;
}): Promise<void> {
  if (!UUID_RE.test(params.worldId)) {
    throw new WorldSubmissionError("Invalid world id", 400);
  }
  const [row] = await db
    .select()
    .from(worlds)
    .where(eq(worlds.id, params.worldId))
    .limit(1);
  if (!row) {
    throw new WorldSubmissionError("World not found", 404);
  }
  if (row.ugc_review_status !== UGC_REVIEW_PENDING) {
    throw new WorldSubmissionError("This world is not awaiting review", 409);
  }
  const now = new Date();
  if (params.action === "reject") {
    await db
      .update(worlds)
      .set({
        ugc_review_status: UGC_REVIEW_REJECTED,
        rejection_reason:
          params.rejectionReason?.trim()?.slice(0, 500) || null,
        submitted_for_review_at: null,
        updated_at: now,
      })
      .where(eq(worlds.id, params.worldId));
    logServerAnalyticsEvent("world_ugc_rejected", {
      world_id: params.worldId,
    });
    return;
  }

  const [agg] = await db.select({ m: max(worlds.sort_order) }).from(worlds);
  const nextSort = Number(agg?.m ?? 0) + 1;

  await db
    .update(worlds)
    .set({
      status: "published",
      ugc_review_status: UGC_REVIEW_NONE,
      rejection_reason: null,
      published_revision: sql`${worlds.published_revision} + 1`,
      sort_order: nextSort,
      submitted_for_review_at: null,
      updated_at: now,
    })
    .where(eq(worlds.id, params.worldId));

  logServerAnalyticsEvent("world_ugc_approved", {
    world_id: params.worldId,
  });
}
