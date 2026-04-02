import { NextRequest, NextResponse } from "next/server";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { authServerLog } from "@/lib/auth/auth-server-log";
import {
  UPGRADE_COOKIE_NAME,
  upgradeCookieAssignOptions,
} from "@/lib/auth/upgrade-cookie";

function isGuestEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.endsWith("@ashveil.guest");
}

export async function POST(request: NextRequest) {
  void request;
  try {
    const user = await requireUser();
    if (!user) {
      authServerLog("upgrade_prepare", { result: "unauthorized" });
      return unauthorizedResponse();
    }

    // We only support “upgrade” from guest accounts.
    // Guest accounts in this codebase use `guest-<uuid>@ashveil.guest`.
    if (!isGuestEmail(user.email)) {
      authServerLog("upgrade_prepare", { result: "not_guest_session" });
      return apiError("Sign in with Google is only for guest accounts", 400);
    }

    authServerLog("upgrade_prepare", {
      result: "ok",
      userIdPrefix: `${user.id.slice(0, 8)}…`,
    });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(UPGRADE_COOKIE_NAME, user.id, upgradeCookieAssignOptions());
    return res;
  } catch (e) {
    return handleApiError(e);
  }
}

