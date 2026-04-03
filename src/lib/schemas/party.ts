import { z } from "zod";
import type { output } from "zod";

import { PartySecretsV1Schema } from "@/lib/schemas/party-secrets";

/** Server-driven party room phases (v1). */
export const PartyPhaseSchema = z.enum([
  "lobby",
  "submit",
  "merge_pending",
  "narrate",
  "forgery_guess",
  "vote",
  "tiebreak_submit",
  "tiebreak_vote",
  "finale_tie_vote",
  "reveal",
  "ended",
]);
export type PartyPhase = output<typeof PartyPhaseSchema>;

const PartySubmissionSchema = z.object({
  text: z.string(),
  submitted_at: z.string(),
});

/** Canonical JSON shape stored in `sessions.party_config` (versioned). */
export const PartyConfigV1Schema = z.object({
  version: z.literal(1),
  template_key: z.string().min(1).max(128),
  party_phase: PartyPhaseSchema,
  round_index: z.number().int().min(0).max(99),
  total_rounds: z.number().int().min(1).max(24),
  /** Host-editable: shared story lens (e.g. “the crew”, “our witness”). Not a character builder. */
  shared_role_label: z.string().max(200).nullable().optional(),
  carry_forward: z.string().nullable().optional(),
  phase_deadline_iso: z.string().nullable().optional(),
  submissions: z.record(z.string().uuid(), PartySubmissionSchema).optional(),
  votes_this_round: z.record(z.string().uuid(), z.string().uuid()).optional(),
  vp_totals: z.record(z.string().uuid(), z.number()).optional(),
  merged_beat: z.string().nullable().optional(),
  /**
   * AI-written establishing narration for this round’s submit phase (premise + tags + bible + art).
   * Cleared when leaving submit for a new round.
   */
  round_scene_beat: z.string().nullable().optional(),
  /** Latest merged-round scene art URL (serving path or absolute); cleared each new round. */
  scene_image_url: z.string().nullable().optional(),
  instigator_enabled: z.boolean().optional(),
  instigator_slot_id: z.string().nullable().optional(),
  slot_attribution: z
    .record(z.string(), z.enum(["player", "forgery"]))
    .optional(),
  /** Anonymous slot list for TV/clients (no attribution until `reveal`). */
  submission_slots_public: z
    .array(
      z.object({
        slot_id: z.string().min(1).max(80),
        text: z.string(),
      }),
    )
    .optional(),
  /**
   * Server-only: anonymous slot_id → player uuid for crowd vote (never sent to clients).
   * Player lines only; instigator forgery slot is omitted.
   */
  vote_slot_owner: z.record(z.string().min(1).max(80), z.string().uuid()).optional(),
  /** Revote among players tied after the main crowd vote. */
  tiebreak_contender_ids: z.array(z.string().uuid()).optional(),
  tiebreak_submissions: z.record(z.string().uuid(), PartySubmissionSchema).optional(),
  /** End-of-game: tied VP leaders; losers vote anonymously among these ids. */
  finale_tie_contender_ids: z.array(z.string().uuid()).optional(),
  /** Filled when entering `ended` — who won the table (breaks VP ties after finale vote). */
  party_champion_player_id: z.string().uuid().nullable().optional(),
  forgery_guesses: z.record(z.string().uuid(), z.string().min(1)).optional(),
  fp_totals: z.record(z.string().uuid(), z.number()).optional(),
});

export type PartyConfigV1 = output<typeof PartyConfigV1Schema>;

export function createInitialPartyConfig(
  templateKey: string,
  totalRounds = 6,
  opts?: { instigatorEnabled?: boolean },
): PartyConfigV1 {
  return {
    version: 1,
    template_key: templateKey,
    party_phase: "lobby",
    round_index: 0,
    total_rounds: totalRounds,
    carry_forward: null,
    submissions: {},
    votes_this_round: {},
    vp_totals: {},
    fp_totals: {},
    merged_beat: null,
    round_scene_beat: null,
    scene_image_url: null,
    instigator_enabled: opts?.instigatorEnabled ?? false,
    shared_role_label: null,
  };
}

/** Safe subset for clients / TV (no secret slot→forgery map until reveal). */
export type PartyConfigClientView = {
  templateKey: string;
  partyPhase: PartyPhase;
  roundIndex: number;
  totalRounds: number;
  /** Shared POV label from host (optional). */
  sharedRoleLabel?: string | null;
  phaseDeadlineIso?: string | null;
  carryForward?: string | null;
  /** When in a vote revote, only these players submit tiebreak lines. */
  tiebreakContenderIds?: string[];
  /** Tied VP leaders — losers vote among them in `finale_tie_vote`. */
  finaleTieContenderIds?: string[];
  /** Set when the party ends. */
  partyChampionPlayerId?: string | null;
  submissions?: Record<string, { text: string; submitted_at: string }>;
  votesThisRound?: Record<string, string>;
  vpTotals?: Record<string, number>;
  /** Crowd favorite + correct forgery guesses (when instigator enabled). */
  fpTotals?: Record<string, number>;
  mergedBeat?: string | null;
  sceneImageUrl?: string | null;
  instigatorEnabled: boolean;
  /** Anonymous lines (forgery_guess / vote); no per-slot kind until `reveal`. */
  submissionSlots?: Array<{ slotId: string; text: string }>;
  /** During vote: slot ids that accept crowd VP (player lines only; excludes instigator forgery). */
  crowdVoteSlotIds?: string[];
  /** Set only in `reveal` — which slot was the instigator line. */
  revealedForgerySlotId?: string | null;
  /** Set only in `reveal` — full attribution map for recap. */
  slotAttribution?: Record<string, "player" | "forgery"> | null;
  /** Only when `partyPhase === "ended"` — secret-role bonus points (no role text). */
  secretBpTotals?: Record<string, number>;
};

export function partyConfigForSessionPayload(
  raw: unknown,
  options?: { partySecretsRaw?: unknown },
): PartyConfigClientView | null {
  const p = PartyConfigV1Schema.safeParse(raw);
  if (!p.success) return null;
  const c = p.data;

  const slots =
    c.submission_slots_public?.map((s) => ({
      slotId: s.slot_id,
      text: s.text,
    })) ?? undefined;

  const voteOwners = c.vote_slot_owner ?? {};
  const anonymousVotePhase =
    c.party_phase === "vote" ||
    c.party_phase === "tiebreak_vote" ||
    c.party_phase === "finale_tie_vote";
  const hasAnonymousVote =
    anonymousVotePhase && Object.keys(voteOwners).length > 0;

  const reveal =
    c.party_phase === "reveal" &&
    c.instigator_slot_id?.trim() &&
    c.slot_attribution;

  let secretBpTotals: Record<string, number> | undefined;
  if (c.party_phase === "ended" && options?.partySecretsRaw != null) {
    const ps = PartySecretsV1Schema.safeParse(options.partySecretsRaw);
    if (ps.success && ps.data.secret_bp_totals) {
      const t = ps.data.secret_bp_totals;
      if (Object.keys(t).length > 0) secretBpTotals = t;
    }
  }

  const crowdVoteSlotIds =
    anonymousVotePhase && Object.keys(voteOwners).length > 0
      ? Object.keys(voteOwners).sort((a, b) => a.localeCompare(b))
      : undefined;

  const tiebreakIds = c.tiebreak_contender_ids;
  const tiebreakContenderIds =
    c.party_phase === "tiebreak_submit" || c.party_phase === "tiebreak_vote"
      ? tiebreakIds && tiebreakIds.length > 0
        ? [...tiebreakIds].sort((a, b) => a.localeCompare(b))
        : undefined
      : undefined;

  const finaleIds = c.finale_tie_contender_ids;
  const finaleTieContenderIds =
    c.party_phase === "finale_tie_vote" && finaleIds && finaleIds.length > 0
      ? [...finaleIds].sort((a, b) => a.localeCompare(b))
      : undefined;

  return {
    templateKey: c.template_key,
    partyPhase: c.party_phase,
    roundIndex: c.round_index,
    totalRounds: c.total_rounds,
    sharedRoleLabel: c.shared_role_label ?? null,
    phaseDeadlineIso: c.phase_deadline_iso ?? null,
    carryForward: c.carry_forward ?? null,
    tiebreakContenderIds,
    finaleTieContenderIds,
    partyChampionPlayerId:
      c.party_phase === "ended"
        ? (c.party_champion_player_id ?? null)
        : undefined,
    submissions: hasAnonymousVote ? {} : (c.submissions ?? {}),
    votesThisRound: c.votes_this_round ?? {},
    vpTotals: c.vp_totals ?? {},
    fpTotals: c.fp_totals ?? {},
    mergedBeat: c.merged_beat ?? null,
    sceneImageUrl: c.scene_image_url ?? null,
    instigatorEnabled: c.instigator_enabled ?? false,
    submissionSlots: slots,
    crowdVoteSlotIds,
    revealedForgerySlotId: reveal ? c.instigator_slot_id : undefined,
    slotAttribution: reveal ? c.slot_attribution : undefined,
    secretBpTotals,
  };
}
