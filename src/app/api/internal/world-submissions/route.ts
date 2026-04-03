import { NextRequest, NextResponse } from "next/server";

import { apiError, handleApiError } from "@/lib/api/errors";
import { internalBearerAuthorized } from "@/lib/auth/guards";
import { listPendingWorldSubmissions } from "@/server/services/world-ugc-service";

function internalMetricsEnabled(): boolean {
  const v = process.env.ASHVEIL_INTERNAL_METRICS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Pending UGC rows for ops moderation (same gate as world-metrics). */
export async function GET(request: NextRequest) {
  try {
    if (!internalMetricsEnabled()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!internalBearerAuthorized(request)) {
      return apiError("Unauthorized", 401);
    }
    const pending = await listPendingWorldSubmissions();
    return NextResponse.json(
      { generatedAt: new Date().toISOString(), pending },
      { status: 200 },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
