import { NextRequest, NextResponse } from "next/server";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";

const UPGRADE_COOKIE = "falvos.upgrade_guest_id";

function isGuestEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.endsWith("@ashveil.guest");
}

export async function POST(request: NextRequest) {
  void request;
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    // We only support “upgrade” from guest accounts.
    // Guest accounts in this codebase use `guest-<uuid>@ashveil.guest`.
    const email = (user as unknown as { email?: string | null }).email ?? null;
    if (!isGuestEmail(email)) {
      return apiError("Upgrade is only available for guest accounts", 400);
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(UPGRADE_COOKIE, user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 15, // 15 minutes
    });
    return res;
  } catch (e) {
    return handleApiError(e);
  }
}

