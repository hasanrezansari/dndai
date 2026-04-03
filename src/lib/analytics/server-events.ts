import { createHash } from "node:crypto";

/** Structured logs for ops / log drains; no third-party SDK in v1. */
export function logServerAnalyticsEvent(
  name: string,
  payload: Record<string, unknown>,
): void {
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: name,
      ...payload,
    }),
  );
}

export function hashUserIdForAnalytics(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}
