import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { isSessionMember, requireUser } from "@/lib/auth/guards";
import { getDisplayTokenFromRequest, verifyDisplayToken } from "@/lib/display-token";
import { db } from "@/lib/db";
import { sceneSnapshots } from "@/lib/db/schema";

const DEFAULT_ALLOWED_IMAGE_HOSTS = [
  "fal.media",
  "v3.fal.media",
  "oaidalleapiprodscus.blob.core.windows.net",
  "replicate.delivery",
] as const;

function buildAllowedImageHostSet(): Set<string> {
  const set = new Set<string>(DEFAULT_ALLOWED_IMAGE_HOSTS);
  const extra = process.env.SCENE_IMAGE_EXTRA_REDIRECT_HOSTS?.trim();
  if (extra) {
    for (const h of extra.split(",")) {
      const t = h.trim().toLowerCase();
      if (t) set.add(t);
    }
  }
  const r2Base = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (r2Base) {
    try {
      set.add(new URL(r2Base).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  return set;
}

const ALLOWED_IMAGE_HOSTS = buildAllowedImageHostSet();

function isAllowedRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      ALLOWED_IMAGE_HOSTS.has(parsed.hostname.toLowerCase()) &&
      parsed.protocol === "https:"
    );
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; snapshotId: string }> },
) {
  const { id: sessionId, snapshotId } = await context.params;

  const displayToken = getDisplayTokenFromRequest(request);
  if (displayToken) {
    const verified = await verifyDisplayToken(displayToken);
    if (!verified || verified.sessionId !== sessionId) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else {
    const user = await requireUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (!(await isSessionMember(sessionId, user.id))) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

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
    if (!isAllowedRedirectUrl(raw)) {
      return new NextResponse("Forbidden redirect target", { status: 403 });
    }
    return NextResponse.redirect(raw, 302);
  }

  const match = raw.match(/^data:(image\/[\w+.-]+);base64,/);
  if (!match) {
    return new NextResponse("Bad image data", { status: 500 });
  }

  const mime = match[1]!;
  const b64 = raw.slice(match[0]!.length);
  const buf = Buffer.from(b64, "base64");

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buf.length),
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
