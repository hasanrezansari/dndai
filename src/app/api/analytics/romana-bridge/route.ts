import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  hashUserIdForAnalytics,
  logServerAnalyticsEvent,
} from "@/lib/analytics/server-events";
import { requireUser } from "@/lib/auth/guards";

const BodySchema = z.object({
  destination: z.string().max(512).optional(),
});

/**
 * Fire-and-forget client beacon when a user leaves PlayRomana for the main app.
 * Auth optional: logs `user_id_hash` only when signed in.
 */
export async function POST(request: NextRequest) {
  try {
    const json: unknown = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);

    const user = await requireUser();
    logServerAnalyticsEvent("romana_bridge_click", {
      destination: parsed.data.destination ?? null,
      ...(user ? { user_id_hash: hashUserIdForAnalytics(user.id) } : {}),
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
