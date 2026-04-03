import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/errors";
import { getPublishedWorldsGalleryData } from "@/server/services/world-service";

/** Public catalog list (published worlds only) + curated lanes for the gallery UI. */
export async function GET() {
  try {
    const { worlds, lanes } = await getPublishedWorldsGalleryData();
    return NextResponse.json({ worlds, lanes }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
