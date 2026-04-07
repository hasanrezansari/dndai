export type BetrayalFsmPhase =
  | "idle"
  | "rogue_intent"
  | "confronting"
  | "resolved";

const ALLOWED: Record<BetrayalFsmPhase, BetrayalFsmPhase[]> = {
  idle: ["rogue_intent", "confronting", "resolved"],
  rogue_intent: ["confronting", "resolved", "idle"],
  confronting: ["resolved", "idle"],
  resolved: ["idle"],
};

export class BetrayalStateMachineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BetrayalStateMachineError";
  }
}

/** Validates quest-level betrayal.phase transitions (confrontation arc + host resets). */
export function assertBetrayalPhaseTransition(
  from: BetrayalFsmPhase,
  to: BetrayalFsmPhase,
): void {
  if (from === to) return;
  const ok = ALLOWED[from]?.includes(to) ?? false;
  if (!ok) {
    throw new BetrayalStateMachineError(
      `Illegal betrayal phase transition: ${from} → ${to}`,
    );
  }
}
