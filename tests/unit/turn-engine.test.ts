import { describe, expect, it, vi } from "vitest";

const { redisSet } = vi.hoisted(() => ({
  redisSet: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));

vi.mock("@/lib/redis", () => ({
  redis: {
    set: (...args: unknown[]) => redisSet(...args),
    del: vi.fn(),
  },
}));

import {
  computeNextPlayableTurnState,
  computeNextTurnState,
  evaluateTurnOwnership,
} from "@/lib/rules/turn-logic";
import { acquireTurnLock } from "@/server/services/turn-service";

describe("evaluateTurnOwnership", () => {
  it("rejects wrong player", () => {
    const r = evaluateTurnOwnership({
      sessionStatus: "active",
      currentPlayerId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      requestPlayerId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      turn: {
        status: "awaiting_input",
        player_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      },
    });
    expect(r.valid).toBe(false);
    expect(r.error).toBe("Not your turn");
  });

  it("rejects if session not active", () => {
    const r = evaluateTurnOwnership({
      sessionStatus: "lobby",
      currentPlayerId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      requestPlayerId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      turn: {
        status: "awaiting_input",
        player_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      },
    });
    expect(r.valid).toBe(false);
    expect(r.error).toBe("Session not active");
  });

  it("accepts active session, matching player, awaiting_input turn", () => {
    const pid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const r = evaluateTurnOwnership({
      sessionStatus: "active",
      currentPlayerId: pid,
      requestPlayerId: pid,
      turn: { status: "awaiting_input", player_id: pid },
    });
    expect(r.valid).toBe(true);
  });
});

describe("computeNextTurnState", () => {
  it("cycles through players in seat order", () => {
    expect(
      computeNextTurnState({
        currentTurnIndex: 0,
        playerCount: 4,
        currentRound: 1,
      }),
    ).toEqual({
      nextTurnIndex: 1,
      nextRound: 1,
      roundAdvanced: false,
    });
  });

  it("increments round when wrapping to first player", () => {
    expect(
      computeNextTurnState({
        currentTurnIndex: 3,
        playerCount: 4,
        currentRound: 2,
      }),
    ).toEqual({
      nextTurnIndex: 0,
      nextRound: 3,
      roundAdvanced: true,
    });
  });
});

describe("computeNextPlayableTurnState", () => {
  it("skips DM in human_dm mode", () => {
    const ordered = [
      { id: "dm-00000000-0000-4000-8000-000000000001", is_dm: true, seat_index: 0 },
      { id: "p1-00000000-0000-4000-8000-000000000002", is_dm: false, seat_index: 1 },
      { id: "p2-00000000-0000-4000-8000-000000000003", is_dm: false, seat_index: 2 },
    ];
    expect(
      computeNextPlayableTurnState({
        orderedBySeat: ordered,
        sessionMode: "human_dm",
        currentPlayerId: "p1-00000000-0000-4000-8000-000000000002",
        currentRound: 1,
      }),
    ).toMatchObject({
      nextPlayerId: "p2-00000000-0000-4000-8000-000000000003",
      nextTurnIndex: 1,
      nextRound: 1,
      roundAdvanced: false,
    });
  });

  it("includes all seats in ai_dm mode", () => {
    const ordered = [
      { id: "a-00000000-0000-4000-8000-000000000001", is_dm: false, seat_index: 0 },
      { id: "b-00000000-0000-4000-8000-000000000002", is_dm: false, seat_index: 1 },
    ];
    expect(
      computeNextPlayableTurnState({
        orderedBySeat: ordered,
        sessionMode: "ai_dm",
        currentPlayerId: "a-00000000-0000-4000-8000-000000000001",
        currentRound: 2,
      }),
    ).toMatchObject({
      nextPlayerId: "b-00000000-0000-4000-8000-000000000002",
      nextTurnIndex: 1,
      nextRound: 2,
      roundAdvanced: false,
    });
  });
});

describe("acquireTurnLock", () => {
  it("returns false when Redis SET NX does not acquire", async () => {
    redisSet.mockResolvedValueOnce(null);
    const ok = await acquireTurnLock("00000000-0000-4000-8000-000000000001");
    expect(ok).toBe(false);
    expect(redisSet).toHaveBeenCalledWith(
      "turn:lock:00000000-0000-4000-8000-000000000001",
      "1",
      { nx: true, ex: 45 },
    );
  });

  it("returns true when Redis SET NX acquires", async () => {
    redisSet.mockResolvedValueOnce("OK");
    const ok = await acquireTurnLock("00000000-0000-4000-8000-000000000002");
    expect(ok).toBe(true);
  });
});
