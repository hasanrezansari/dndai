import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { authBridgeTokens } from "@/lib/db/schema";
import { generateBridgeToken, hashBridgeToken } from "@/lib/auth/bridge-tokens";

const BodySchema = z.object({
  returnTo: z.string().optional(),
});

function resolveMainOrigin(): string {
  const raw =
    process.env.MAIN_APP_ORIGIN ??
    process.env.NEXT_PUBLIC_MAIN_APP_ORIGIN ??
    "https://playdndai.com";
  return raw.replace(/\/$/, "");
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const json: unknown = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);

    const token = generateBridgeToken();
    const tokenHash = hashBridgeToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2 * 60_000);

    await db.insert(authBridgeTokens).values({
      token_hash: tokenHash,
      user_id: user.id,
      expires_at: expiresAt,
      used_at: null,
    });

    const mainOrigin = resolveMainOrigin();
    const returnTo =
      typeof parsed.data.returnTo === "string" && parsed.data.returnTo.trim()
        ? parsed.data.returnTo.trim()
        : "/adventures";

    const url = new URL(`${mainOrigin}/auth/bridge`);
    url.searchParams.set("token", token);
    url.searchParams.set("returnTo", returnTo);

    return NextResponse.json({ redirectUrl: url.toString() });
  } catch (e) {
    return handleApiError(e);
  }
}

