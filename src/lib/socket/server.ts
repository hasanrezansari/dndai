import Pusher from "pusher";

const hasPusherConfig =
  process.env.PUSHER_APP_ID &&
  process.env.PUSHER_KEY &&
  process.env.PUSHER_SECRET &&
  process.env.PUSHER_CLUSTER;

export const pusherServer: Pusher | null = hasPusherConfig
  ? new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    })
  : null;

export function getSessionChannel(sessionId: string): string {
  return `private-session-${sessionId}`;
}

export async function broadcastToSession(
  sessionId: string,
  event: string,
  data: unknown,
): Promise<void> {
  if (!pusherServer) return;
  await pusherServer.trigger(getSessionChannel(sessionId), event, data);
}
