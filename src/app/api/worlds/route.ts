import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/errors";
import { listPublishedWorlds } from "@/server/services/world-service";

/** Public catalog list (published worlds only). */
export async function GET() {
  try {
    const worlds = await listPublishedWorlds();
    return NextResponse.json({ worlds }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
