import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { apiError, handleApiError } from "@/lib/api/errors";
import { internalBearerAuthorized } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";

function internalMetricsEnabled(): boolean {
  const v = process.env.ASHVEIL_INTERNAL_METRICS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Read-only session aggregates for ops / Metabase validation.
 * Disabled unless `ASHVEIL_INTERNAL_METRICS=1` (returns 404).
 * Auth: `Authorization: Bearer` matching `INTERNAL_API_SECRET` or `NEXTAUTH_SECRET`.
 * Does not touch campaign or party gameplay code paths.
 */
export async function GET(request: NextRequest) {
  try {
    if (!internalMetricsEnabled()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!internalBearerAuthorized(request)) {
      return apiError("Unauthorized", 401);
    }

    const [totalRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sessions);

    const byGameKind = await db
      .select({
        game_kind: sessions.game_kind,
        n: sql<number>`count(*)::int`,
      })
      .from(sessions)
      .groupBy(sessions.game_kind);

    const bySource = await db
      .select({
        acquisition_source: sessions.acquisition_source,
        n: sql<number>`count(*)::int`,
      })
      .from(sessions)
      .groupBy(sessions.acquisition_source);

    const [last24hRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sessions)
      .where(
        sql`${sessions.created_at} >= NOW() - INTERVAL '24 hours'`,
      );

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        totalSessions: totalRow?.n ?? 0,
        sessionsCreatedLast24h: last24hRow?.n ?? 0,
        byGameKind: Object.fromEntries(
          byGameKind.map((r) => [r.game_kind ?? "unknown", r.n]),
        ),
        byAcquisitionSource: Object.fromEntries(
          bySource.map((r) => [
            r.acquisition_source ?? "(null)",
            r.n,
          ]),
        ),
      },
      { status: 200 },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
