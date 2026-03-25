import { Ratelimit } from "@upstash/ratelimit";

import { redis } from "@/lib/redis";

const limiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(2, "1 s"),
      prefix: "ratelimit:ai",
    })
  : null;

export async function checkAIRateLimit(
  sessionId: string,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  if (!limiter) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const result = await limiter.limit(sessionId);

  if (result.success) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const retryAfterMs = Math.max(0, result.reset - Date.now());
  return { allowed: false, retryAfterMs };
}

export async function waitForAIRateLimit(
  sessionId: string,
  maxWaitMs = 5000,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const { allowed, retryAfterMs } = await checkAIRateLimit(sessionId);
    if (allowed) return;

    const waitMs = Math.min(retryAfterMs, maxWaitMs - (Date.now() - start));
    if (waitMs <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
