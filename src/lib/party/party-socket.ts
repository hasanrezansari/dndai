import { broadcastToSession } from "@/lib/socket/server";

/** Party + campaign clients: `state-update` for existing listeners; `party-state-updated` for party-specific refetch. */
export async function broadcastPartyStateRefresh(
  sessionId: string,
  stateVersion: number,
): Promise<void> {
  const payload = { changes: [], state_version: stateVersion };
  try {
    await broadcastToSession(sessionId, "state-update", payload);
    await broadcastToSession(sessionId, "party-state-updated", {
      state_version: stateVersion,
    });
  } catch (e) {
    console.error(e);
  }
}
