import PusherClient from "pusher-js";

let pusherInstance: PusherClient | null = null;

export function getPusherClient(): PusherClient | null {
  if (
    !process.env.NEXT_PUBLIC_PUSHER_KEY ||
    !process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  ) {
    return null;
  }
  if (!pusherInstance) {
    pusherInstance = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      authEndpoint: "/api/pusher/auth",
    });
  }
  return pusherInstance;
}

/**
 * Separate client for read-only room display: authenticates `/api/pusher/auth` with a display JWT.
 * Callers must disconnect/unsubscribe on cleanup — not a singleton.
 */
export function createPusherClientWithDisplayAuth(
  displayToken: string,
): PusherClient | null {
  if (
    !process.env.NEXT_PUBLIC_PUSHER_KEY ||
    !process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  ) {
    return null;
  }
  return new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    authEndpoint: "/api/pusher/auth",
    auth: {
      headers: {
        Authorization: `Bearer ${displayToken}`,
      },
    },
  });
}

export function getSessionChannel(sessionId: string): string {
  return `private-session-${sessionId}`;
}
