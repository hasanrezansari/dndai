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
  /** Player lines only — used for anonymous crowd vote (forgery slot omitted). */
  vote_slot_owner: Record<string, string>;
};

export type AnonymousCrowdVoteSlots = {
  submission_slots_public: Array<{ slot_id: string; text: string }>;
  vote_slot_owner: Record<string, string>;
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
    player_id?: string;
  }> = playerLines.map((l) => ({
    slot_id: randomUUID(),
    text: l.text,
    kind: "player" as const,
    player_id: l.player_id,
  }));

  const instigator_slot_id = randomUUID();
  slotRows.push({
    slot_id: instigator_slot_id,
    text: ft,
    kind: "forgery",
  });

  const shuffled = seededShuffle(slotRows, `${sessionId}:${roundIndex}`);
  const slot_attribution: Record<string, "player" | "forgery"> = {};
  const vote_slot_owner: Record<string, string> = {};
  for (const row of slotRows) {
    slot_attribution[row.slot_id] = row.kind;
    if (row.kind === "player" && row.player_id) {
      vote_slot_owner[row.slot_id] = row.player_id;
    }
  }

  return {
    submission_slots_public: shuffled.map((r) => ({
      slot_id: r.slot_id,
      text: r.text,
    })),
    slot_attribution,
    instigator_slot_id,
    vote_slot_owner,
  };
}

/** Anonymous ballot for end-game VP ties — uses last-round submission text per contender. */
export function buildFinaleAnonymousVoteSlots(params: {
  cfg: PartyConfigV1;
  contenderIds: string[];
  sessionId: string;
}): AnonymousCrowdVoteSlots | null {
  const subs = params.cfg.submissions ?? {};
  const lines = params.contenderIds
    .map((id) => {
      const t = subs[id]?.text?.trim();
      return t ? { player_id: id, text: t } : null;
    })
    .filter(Boolean) as Array<{ player_id: string; text: string }>;
  if (lines.length < 2) return null;
  return buildAnonymousCrowdVoteSlots({
    playerLines: lines,
    sessionId: params.sessionId,
    roundIndex: params.cfg.round_index,
  });
}

/** Anonymous shuffled cards for standard (non-instigator) crowd vote. */
export function buildAnonymousCrowdVoteSlots(params: {
  playerLines: Array<{ player_id: string; text: string }>;
  sessionId: string;
  roundIndex: number;
}): AnonymousCrowdVoteSlots | null {
  const lines = params.playerLines.filter((l) => l.text.trim());
  if (lines.length === 0) return null;

  const rows = lines.map((l) => ({
    slot_id: randomUUID(),
    text: l.text.trim(),
    player_id: l.player_id,
  }));
  const shuffled = seededShuffle(rows, `${params.sessionId}:${params.roundIndex}:crowd`);
  const vote_slot_owner: Record<string, string> = {};
  for (const r of rows) {
    vote_slot_owner[r.slot_id] = r.player_id;
  }
  return {
    submission_slots_public: shuffled.map((r) => ({
      slot_id: r.slot_id,
      text: r.text,
    })),
    vote_slot_owner,
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
