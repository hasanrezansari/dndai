import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { getSparkBalance } from "@/server/services/spark-economy-service";

/**
 * Signed-in user's Spark balance (for HUD / shop). Server is always authoritative.
 */
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const balance = await getSparkBalance(user.id);
    return NextResponse.json({ balance });
  } catch (e) {
    return handleApiError(e);
  }
}
