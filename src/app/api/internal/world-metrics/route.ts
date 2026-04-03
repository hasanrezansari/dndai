import { NextRequest, NextResponse } from "next/server";

import { apiError, handleApiError } from "@/lib/api/errors";
import { internalBearerAuthorized } from "@/lib/auth/guards";
import { listWorldsMetricsRows } from "@/server/services/world-service";

function internalMetricsEnabled(): boolean {
  const v = process.env.ASHVEIL_INTERNAL_METRICS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Catalog fork/like aggregates for ops dashboards (Metabase, etc.).
 * Same gate as `GET /api/internal/session-metrics`.
 */
export async function GET(request: NextRequest) {
  try {
    if (!internalMetricsEnabled()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!internalBearerAuthorized(request)) {
      return apiError("Unauthorized", 401);
    }

    const worlds = await listWorldsMetricsRows();
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        worlds,
        totals: {
          worlds: worlds.length,
          forks: worlds.reduce((s, w) => s + w.forkCount, 0),
          likes: worlds.reduce((s, w) => s + w.likeCount, 0),
        },
      },
      { status: 200 },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
