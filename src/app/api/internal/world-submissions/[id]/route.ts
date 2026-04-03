import { NextRequest, NextResponse } from "next/server";

import { apiError, handleApiError } from "@/lib/api/errors";
import { internalBearerAuthorized } from "@/lib/auth/guards";
import {
  moderateWorldSubmission,
  ModerateWorldSubmissionBodySchema,
} from "@/server/services/world-ugc-service";

function internalMetricsEnabled(): boolean {
  const v = process.env.ASHVEIL_INTERNAL_METRICS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    if (!internalMetricsEnabled()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!internalBearerAuthorized(request)) {
      return apiError("Unauthorized", 401);
    }
    const { id } = await context.params;
    const raw: unknown = await request.json().catch(() => ({}));
    const parsed = ModerateWorldSubmissionBodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(parsed.error.issues.map((i) => i.message).join("; "), 400);
    }
    await moderateWorldSubmission({
      worldId: id,
      action: parsed.data.action,
      rejectionReason: parsed.data.rejectionReason,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
