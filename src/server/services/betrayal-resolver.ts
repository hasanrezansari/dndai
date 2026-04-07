import type {
  BetrayalQuestSlice,
  QuestState,
} from "@/server/services/quest-service";

/** Reference + extensible outcome ids; register handlers below. */
export const REFERENCE_BETRAYAL_OUTCOME_IDS = [
  "betrayal_traitor_escapes",
  "betrayal_traitor_caught",
  "betrayal_party_negotiates",
] as const;

export type ReferenceBetrayalOutcomeId =
  (typeof REFERENCE_BETRAYAL_OUTCOME_IDS)[number];

export type BetrayalApplyContext = {
  traitor_player_id?: string | null;
  macguffin_holder_player_id?: string | null;
  round: number;
};

export type BetrayalResolveResult = {
  quest: QuestState;
  memoryFactLine: string;
};

const FALLBACK_OUTCOME = "betrayal_outcome_unknown";

function baseObjective(quest: QuestState): string {
  return quest.objective?.trim() || "Survive the adventure.";
}

/**
 * Maps server-owned outcome id → quest patch + one canonical memory line for assembler / prompts.
 */
export function applyBetrayalOutcomeToQuest(
  quest: QuestState,
  outcomeId: string,
  ctx: BetrayalApplyContext,
): BetrayalResolveResult {
  const traitor =
    ctx.traitor_player_id ??
    quest.betrayal?.instigator_player_id ??
    null;
  const round = ctx.round;
  const holderFromCtx = ctx.macguffin_holder_player_id ?? null;

  const betrayalSlice: BetrayalQuestSlice = {
    phase: "resolved",
    outcome_id: outcomeId,
    traitor_player_id: traitor,
    last_updated_round: round,
  };

  let nextObjective = baseObjective(quest);
  let memoryFactLine: string;

  switch (outcomeId) {
    case "betrayal_traitor_escapes":
      betrayalSlice.macguffin_holder_player_id = holderFromCtx ?? traitor;
      nextObjective = `${nextObjective} Priority: recover what was taken or stop the betrayer before they escape.`;
      memoryFactLine = `[Betrayal ${outcomeId}] The betrayer fled with the prize; traitor_player_id=${traitor ?? "unknown"}; macguffin_holder_player_id=${betrayalSlice.macguffin_holder_player_id ?? "unknown"}.`;
      break;
    case "betrayal_traitor_caught":
      betrayalSlice.macguffin_holder_player_id = holderFromCtx ?? null;
      nextObjective = `${nextObjective} The party recovered leverage after the betrayal; regroup and press the main objective.`;
      memoryFactLine = `[Betrayal ${outcomeId}] The betrayer was stopped or subdued; party holds the initiative; traitor_player_id=${traitor ?? "unknown"}.`;
      break;
    case "betrayal_party_negotiates":
      betrayalSlice.macguffin_holder_player_id = holderFromCtx;
      nextObjective = `${nextObjective} A fragile truce followed an internal betrayal—trust is low but the table continues.`;
      memoryFactLine = `[Betrayal ${outcomeId}] The party negotiated after betrayal; terms are tense but play continues; traitor_player_id=${traitor ?? "unknown"}.`;
      break;
    default:
      betrayalSlice.outcome_id = FALLBACK_OUTCOME;
      memoryFactLine = `[Betrayal ${FALLBACK_OUTCOME}] Registered outcome "${outcomeId}" has no dedicated handler yet—confirm table facts with the host; traitor_player_id=${traitor ?? "none"}.`;
      break;
  }

  const next: QuestState = {
    ...quest,
    objective: nextObjective.slice(0, 2000),
    betrayal: betrayalSlice,
    updatedAt: new Date().toISOString(),
  };

  return { quest: next, memoryFactLine };
}
