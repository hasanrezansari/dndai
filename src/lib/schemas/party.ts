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
  carry_forward: z.string().nullable().optional(),
  phase_deadline_iso: z.string().nullable().optional(),
  submissions: z.record(z.string().uuid(), PartySubmissionSchema).optional(),
  votes_this_round: z.record(z.string().uuid(), z.string().uuid()).optional(),
  vp_totals: z.record(z.string().uuid(), z.number()).optional(),
  merged_beat: z.string().nullable().optional(),
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
    scene_image_url: null,
    instigator_enabled: opts?.instigatorEnabled ?? false,
  };
}

/** Safe subset for clients / TV (no secret slot→forgery map until reveal). */
export type PartyConfigClientView = {
  templateKey: string;
  partyPhase: PartyPhase;
  roundIndex: number;
  totalRounds: number;
  phaseDeadlineIso?: string | null;
  carryForward?: string | null;
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

  return {
    templateKey: c.template_key,
    partyPhase: c.party_phase,
    roundIndex: c.round_index,
    totalRounds: c.total_rounds,
    phaseDeadlineIso: c.phase_deadline_iso ?? null,
    carryForward: c.carry_forward ?? null,
    submissions: c.submissions ?? {},
    votesThisRound: c.votes_this_round ?? {},
    vpTotals: c.vp_totals ?? {},
    fpTotals: c.fp_totals ?? {},
    mergedBeat: c.merged_beat ?? null,
    sceneImageUrl: c.scene_image_url ?? null,
    instigatorEnabled: c.instigator_enabled ?? false,
    submissionSlots: slots,
    revealedForgerySlotId: reveal ? c.instigator_slot_id : undefined,
    slotAttribution: reveal ? c.slot_attribution : undefined,
    secretBpTotals,
  };
}
