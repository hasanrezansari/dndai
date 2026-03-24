import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { pusherServer } from "@/lib/socket/server";

const AuthBodySchema = z.object({
  socket_id: z.string().min(1),
  channel_name: z.string().min(1),
});

const PRIVATE_SESSION_PREFIX = "private-session-";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const contentType = request.headers.get("content-type") ?? "";
    let socketId: string | undefined;
    let channelName: string | undefined;

    if (contentType.includes("application/json")) {
      const json: unknown = await request.json();
      const parsed = AuthBodySchema.safeParse(json);
      if (!parsed.success) {
        return apiError("Invalid body", 400);
      }
      socketId = parsed.data.socket_id;
      channelName = parsed.data.channel_name;
    } else {
      const text = await request.text();
      const params = new URLSearchParams(text);
      socketId = params.get("socket_id") ?? undefined;
      channelName = params.get("channel_name") ?? undefined;
    }

    if (!socketId || !channelName) {
      return apiError("Invalid body", 400);
    }

    if (!channelName.startsWith(PRIVATE_SESSION_PREFIX)) {
      return apiError("Forbidden", 403);
    }
    const sessionId = channelName.slice(PRIVATE_SESSION_PREFIX.length);
    if (!z.string().uuid().safeParse(sessionId).success) {
      return apiError("Forbidden", 403);
    }
    const [member] = await db
      .select({ id: players.id })
      .from(players)
      .where(
        and(eq(players.session_id, sessionId), eq(players.user_id, user.id)),
      )
      .limit(1);
    if (!member) {
      return apiError("Forbidden", 403);
    }

    if (!pusherServer) {
      return apiError("Pusher not configured", 503);
    }
    const auth = pusherServer.authorizeChannel(socketId, channelName);
    return NextResponse.json(auth);
  } catch (e) {
    return handleApiError(e);
  }
}
