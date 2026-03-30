import { Ratelimit } from "@upstash/ratelimit";

import { redis } from "@/lib/redis";

const limiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 m"),
      prefix: "ratelimit:watch-display",
    })
  : null;

export async function checkWatchDisplayRateLimit(
  ipKey: string,
): Promise<{ allowed: boolean }> {
  if (!limiter) {
    return { allowed: true };
  }
  const result = await limiter.limit(ipKey);
  return { allowed: result.success };
}
