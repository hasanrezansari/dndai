import { z } from "zod";

const packRowSchema = z.object({
  packId: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  sparks: z.number().int().positive(),
  /** Stripe Price id (`price_...`) for global checkout. */
  stripePriceId: z.string().min(1).max(128),
  /** Razorpay order amount in paise (INR smallest unit). */
  razorpayAmountPaise: z.number().int().positive(),
  /** @deprecated Legacy Dodo dashboard product id — only if still processing old webhooks. */
  productId: z.string().min(1).max(128).optional(),
});

export type SparkPackDefinition = z.infer<typeof packRowSchema>;

/**
 * Server catalog: `SPARK_PACKS_JSON` (see `.env.example`).
 * Legacy `DODO_SPARK_PACKS_JSON` is only used for old Dodo webhook product-id → sparks mapping.
 */
export function getSparkPackCatalog(): SparkPackDefinition[] {
  const raw = process.env.SPARK_PACKS_JSON?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: SparkPackDefinition[] = [];
    for (const row of parsed) {
      const r = packRowSchema.safeParse(row);
      if (r.success) out.push(r.data);
    }
    return out;
  } catch {
    return [];
  }
}

export function getSparkPackById(
  packId: string,
): SparkPackDefinition | undefined {
  return getSparkPackCatalog().find((p) => p.packId === packId);
}

const legacyDodoRowSchema = z.object({
  packId: z.string().optional(),
  sparks: z.number().int().positive(),
  productId: z.string().min(1),
});

/** Legacy Dodo-only rows (no Stripe/Razorpay) — webhook product id → sparks. */
function legacyDodoProductSparks(): Map<string, number> {
  const raw = process.env.DODO_SPARK_PACKS_JSON?.trim();
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Map();
    const m = new Map<string, number>();
    for (const row of parsed) {
      const r = legacyDodoRowSchema.safeParse(row);
      if (r.success) m.set(r.data.productId, r.data.sparks);
    }
    return m;
  } catch {
    return new Map();
  }
}

/** Legacy Dodo cart lookup + optional `productId` on unified packs. */
export function sparksForProductId(productId: string): number | null {
  const pack = getSparkPackCatalog().find((p) => p.productId === productId);
  if (pack) return pack.sparks;
  return legacyDodoProductSparks().get(productId) ?? null;
}

/** Public listing (no price ids) for shop UI. */
export function getPublicSparkPacks(): Array<{
  packId: string;
  label: string;
  sparks: number;
}> {
  return getSparkPackCatalog().map(({ packId, label, sparks }) => ({
    packId,
    label,
    sparks,
  }));
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function isRazorpayConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_ID?.trim() &&
      process.env.RAZORPAY_KEY_SECRET?.trim(),
  );
}

/** Publishes to browser for Razorpay Checkout (safe key id only). */
export function getPublicRazorpayKeyId(): string | null {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || null;
}

/**
 * New checkout: catalog + both providers (routing is server-side by region).
 */
export function isSparkCheckoutConfigured(): boolean {
  const packs = getSparkPackCatalog();
  if (packs.length === 0) return false;
  if (!isStripeConfigured() || !isRazorpayConfigured()) return false;
  if (!getPublicRazorpayKeyId()) return false;
  return packs.every(
    (p) => p.stripePriceId.length > 0 && p.razorpayAmountPaise > 0,
  );
}

/** @deprecated */
export function isDodoCheckoutConfigured(): boolean {
  return Boolean(process.env.DODO_PAYMENTS_API_KEY?.trim());
}
