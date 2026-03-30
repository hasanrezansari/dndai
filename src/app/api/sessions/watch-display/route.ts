import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { checkWatchDisplayRateLimit } from "@/lib/display-watch-rate-limit";
import { signDisplayToken } from "@/lib/display-token";
import { isValidJoinCodeFormat } from "@/lib/join-code";
import { findSessionIdByJoinCodeForDisplayWatch } from "@/server/services/session-service";

const BodySchema = z.object({
  joinCode: z.string().min(1),
});

function clientIpKey(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export async function POST(request: NextRequest) {
  try {
    const { allowed } = await checkWatchDisplayRateLimit(clientIpKey(request));
    if (!allowed) {
      return apiError("Too many attempts. Try again shortly.", 429);
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

    const raw = parsed.data.joinCode;
    if (!isValidJoinCodeFormat(raw)) {
      return apiError("Invalid room code", 400);
    }

    const sessionId = await findSessionIdByJoinCodeForDisplayWatch(raw);
    if (!sessionId) {
      return apiError("Session not found", 404);
    }

    let path: string;
    try {
      const { token } = await signDisplayToken(sessionId);
      path = `/session/${sessionId}/display?t=${encodeURIComponent(token)}`;
    } catch {
      return apiError("Display unavailable", 503);
    }

    return NextResponse.json({ path });
  } catch (e) {
    return handleApiError(e);
  }
}
