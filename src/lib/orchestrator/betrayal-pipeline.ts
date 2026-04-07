import type { TurnContext } from "@/lib/orchestrator/context-builder";

/**
 * Appended to the narrator system prompt when a confrontational betrayal beat is live.
 * This is the orchestrator “interrupt”: narration must foreground PvP tension without
 * resolving the host-controlled arc.
 */
export const BETRAYAL_INTERRUPT_SYSTEM_APPENDIX = `BETRAYAL BEAT (TABLE-MANDATED):
The JSON field "betrayal_spine" includes phase. When phase is "rogue_intent" or "confronting":
- Treat internal-party suspicion, split loyalty, or betrayal tension as foreground for this beat.
- Weave the acting character's stated action through that interpersonal pressure; do not flatten it into unrelated spectacle.
- Do not fully reconcile or permanently resolve the betrayal arc here — the host registers outcomes separately.
- If phase is "rogue_intent", let distrust, hesitation, or a member pulling against the group show in the fiction where dice allow.
- If phase is "confronting", pace it as a charged interpersonal clash (words, blades, or moral stands) appropriate to dice outcomes.
Still obey word limits, scene continuity, and dice fidelity.`;

function resolvePartyMemberLabel(
  partyMembers: TurnContext["partyMembers"],
  playerId: string | null | undefined,
): string | null {
  if (!playerId?.trim()) return null;
  const m = partyMembers.find((p) => p.playerId === playerId.trim());
  return m?.name?.trim() || null;
}

/** Richer than a bare phase string: includes resolved character names when known. */
export function buildBetrayalSpineForNarrator(ctx: TurnContext): string | null {
  if (ctx.session.gameKind !== "campaign" || ctx.betrayalMode === "off") {
    return null;
  }
  const inst =
    resolvePartyMemberLabel(ctx.partyMembers, ctx.betrayalInstigatorPlayerId) ??
    (ctx.betrayalInstigatorPlayerId
      ? `player_id=${ctx.betrayalInstigatorPlayerId}`
      : "none");
  const traitor =
    resolvePartyMemberLabel(ctx.partyMembers, ctx.betrayalTraitorPlayerId) ??
    (ctx.betrayalTraitorPlayerId
      ? `player_id=${ctx.betrayalTraitorPlayerId}`
      : "none");
  return `mode=${ctx.betrayalMode}; phase=${ctx.betrayalPhase ?? "idle"}; last_outcome=${ctx.betrayalOutcomeId ?? "none"}; instigator_pc=${inst}; traitor_slot_pc=${traitor}`;
}

export function shouldApplyBetrayalNarratorInterrupt(ctx: TurnContext): boolean {
  return (
    ctx.session.gameKind === "campaign" &&
    ctx.betrayalMode === "confrontational" &&
    (ctx.betrayalPhase === "rogue_intent" || ctx.betrayalPhase === "confronting")
  );
}

/** Deterministic DM prompts when `human_dm` awaits narration during a betrayal beat. */
export function buildHumanDmBetrayalBriefing(ctx: TurnContext): {
  spine: string;
  prompts: string[];
} | null {
  if (ctx.session.gameKind !== "campaign" || ctx.betrayalMode === "off") {
    return null;
  }
  const spine = buildBetrayalSpineForNarrator(ctx);
  if (!spine) return null;
  const prompts =
    ctx.betrayalPhase === "confronting"
      ? [
          "Accusation or ultimatum in the open.",
          "Sudden violence or a shove toward a hazard.",
          "Someone tries to de-escalate and the table refuses.",
        ]
      : ctx.betrayalPhase === "rogue_intent"
        ? [
            "Mistrust in a small gesture or withheld information.",
            "Two allies quietly doubt the same plan.",
          ]
        : [];
  return { spine, prompts };
}

export const BETRAYAL_SETPIECE_PC_VS_PC_APPENDIX = `SETPIECE PRIORITY: This beat targets another hero. Prefer narrative_beat rhythm "setpiece" or meaningful "transition", a vivid image_hint, and a situation_anchor that states both actors' fates clearly for share/clips.`;
