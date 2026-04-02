import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { apiError, handleApiError } from "@/lib/api/errors";
import { authServerLog } from "@/lib/auth/auth-server-log";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import {
  UPGRADE_COOKIE_NAME,
  upgradeCookieDeleteOptions,
} from "@/lib/auth/upgrade-cookie";
import { db } from "@/lib/db";
import { authUsers, players, sessions } from "@/lib/db/schema";

function isGuestEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.endsWith("@ashveil.guest");
}

export async function POST(request: NextRequest) {
  void request;
  try {
    const user = await requireUser();
    if (!user) {
      authServerLog("upgrade_complete", { result: "unauthorized" });
      return unauthorizedResponse();
    }

    const guestId = request.cookies.get(UPGRADE_COOKIE_NAME)?.value ?? "";
    if (!guestId) {
      authServerLog("upgrade_complete", { result: "missing_cookie" });
      return apiError("Missing upgrade context", 400);
    }
    if (guestId === user.id) {
      authServerLog("upgrade_complete", {
        result: "guest_id_equals_session",
        userIdPrefix: `${user.id.slice(0, 8)}…`,
      });
      return apiError(
        "Google sign-in did not switch this browser from guest mode; try Sign in with Google again from home.",
        400,
      );
    }

    // Validate that the cookie points to an actual guest user.
    const [guestRow] = await db
      .select({ id: authUsers.id, email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, guestId))
      .limit(1);
    if (!guestRow || !isGuestEmail(guestRow.email)) {
      authServerLog("upgrade_complete", {
        result: "invalid_guest_cookie",
        guestIdPrefix: `${guestId.slice(0, 8)}…`,
      });
      return apiError("Invalid upgrade context", 400);
    }

    // Prevent ambiguous merges: if the Google user is already a member of any
    // session that the guest belongs to, we abort rather than risking data loss.
    const guestSessions = await db
      .select({ sessionId: players.session_id })
      .from(players)
      .where(eq(players.user_id, guestId));

    if (guestSessions.length > 0) {
      const sessionIds = guestSessions.map((s) => s.sessionId);
      const [conflict] = await db
        .select({ id: players.id })
        .from(players)
        .where(
          and(
            eq(players.user_id, user.id),
            inArray(players.session_id, sessionIds),
          ),
        )
        .limit(1);
      if (conflict) {
        authServerLog("upgrade_complete", { result: "session_conflict", status: 409 });
        return apiError(
          "Upgrade conflict: account already in one of these sessions",
          409,
        );
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(players)
        .set({ user_id: user.id })
        .where(eq(players.user_id, guestId));

      await tx
        .update(sessions)
        .set({ host_user_id: user.id })
        .where(eq(sessions.host_user_id, guestId));
    });

    authServerLog("upgrade_complete", {
      result: "ok",
      guestIdPrefix: `${guestId.slice(0, 8)}…`,
      googleUserIdPrefix: `${user.id.slice(0, 8)}…`,
    });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(UPGRADE_COOKIE_NAME, "", upgradeCookieDeleteOptions());
    return res;
  } catch (e) {
    return handleApiError(e);
  }
}

