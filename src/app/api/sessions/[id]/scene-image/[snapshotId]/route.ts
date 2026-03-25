import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sceneSnapshots } from "@/lib/db/schema";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; snapshotId: string }> },
) {
  const { id: sessionId, snapshotId } = await context.params;

  const [snap] = await db
    .select({ image_url: sceneSnapshots.image_url })
    .from(sceneSnapshots)
    .where(
      and(
        eq(sceneSnapshots.id, snapshotId),
        eq(sceneSnapshots.session_id, sessionId),
      ),
    )
    .limit(1);

  const raw = snap?.image_url;
  if (!raw) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!raw.startsWith("data:")) {
    return NextResponse.redirect(raw, 302);
  }

  const match = raw.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    return new NextResponse("Bad image data", { status: 500 });
  }

  const mime = match[1]!;
  const buf = Buffer.from(match[2]!, "base64");

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buf.length),
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
