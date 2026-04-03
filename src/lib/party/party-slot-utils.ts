import { randomUUID } from "crypto";

import type { PartyConfigV1 } from "@/lib/schemas/party";

/** Deterministic shuffle for stable tests and replay (seed = session + round). */
export function seededShuffle<T>(arr: T[], seedStr: string): T[] {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed + seedStr.charCodeAt(i)) | 0;
  }
  const rnd = mulberry32(seed >>> 0);
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type PartyRoundSlots = {
  submission_slots_public: Array<{ slot_id: string; text: string }>;
  slot_attribution: Record<string, "player" | "forgery">;
  instigator_slot_id: string;
};

/**
 * Build anonymous slot list + server-only attribution map for instigator rounds.
 * Requires at least two player lines and non-empty forgery text.
 */
export function buildInstigatorRoundSlots(params: {
  playerLines: Array<{ player_id: string; text: string }>;
  forgeryText: string;
  sessionId: string;
  roundIndex: number;
}): PartyRoundSlots | null {
  const { playerLines, forgeryText, sessionId, roundIndex } = params;
  const ft = forgeryText.trim();
  if (playerLines.length < 2 || !ft) return null;

  const slotRows: Array<{
    slot_id: string;
    text: string;
    kind: "player" | "forgery";
  }> = playerLines.map((l) => ({
    slot_id: randomUUID(),
    text: l.text,
    kind: "player" as const,
  }));

  const instigator_slot_id = randomUUID();
  slotRows.push({
    slot_id: instigator_slot_id,
    text: ft,
    kind: "forgery",
  });

  const shuffled = seededShuffle(slotRows, `${sessionId}:${roundIndex}`);
  const slot_attribution: Record<string, "player" | "forgery"> = {};
  for (const row of slotRows) {
    slot_attribution[row.slot_id] = row.kind;
  }

  return {
    submission_slots_public: shuffled.map((r) => ({
      slot_id: r.slot_id,
      text: r.text,
    })),
    slot_attribution,
    instigator_slot_id,
  };
}

/** +1 forgery point per player who guessed the instigator slot. */
export function applyForgeryPointsFromGuesses(cfg: PartyConfigV1): Record<
  string,
  number
> {
  const instigator = cfg.instigator_slot_id?.trim();
  const guesses = cfg.forgery_guesses ?? {};
  const fp = { ...(cfg.fp_totals ?? {}) };
  if (!instigator) return fp;

  for (const [playerId, slotId] of Object.entries(guesses)) {
    if (slotId === instigator) {
      fp[playerId] = (fp[playerId] ?? 0) + 1;
    }
  }
  return fp;
}

/** Pick deterministic default guess (smallest slot_id lexicographically). */
export function pickAutoForgeryGuessSlot(
  slotIds: string[],
): string | null {
  if (slotIds.length === 0) return null;
  return [...slotIds].sort((a, b) => a.localeCompare(b))[0] ?? null;
}
