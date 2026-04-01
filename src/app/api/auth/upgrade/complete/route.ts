import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { authUsers, players, sessions } from "@/lib/db/schema";

const UPGRADE_COOKIE = "falvos.upgrade_guest_id";

function isGuestEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.endsWith("@ashveil.guest");
}

export async function POST(request: NextRequest) {
  void request;
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const guestId = request.cookies.get(UPGRADE_COOKIE)?.value ?? "";
    if (!guestId) {
      return apiError("Missing upgrade context", 400);
    }
    if (guestId === user.id) {
      return apiError("Already signed in as guest", 400);
    }

    // Validate that the cookie points to an actual guest user.
    const [guestRow] = await db
      .select({ id: authUsers.id, email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, guestId))
      .limit(1);
    if (!guestRow || !isGuestEmail(guestRow.email)) {
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

    const res = NextResponse.json({ ok: true });
    res.cookies.set(UPGRADE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (e) {
    return handleApiError(e);
  }
}

