import { webcrypto } from "node:crypto";

export type DieType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";

const DIE_MAX: Record<DieType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
};

export function rollDie(die: DieType): number {
  const max = DIE_MAX[die];
  const arr = new Uint32Array(1);
  webcrypto.getRandomValues(arr);
  return (arr[0]! % max) + 1;
}

export function rollWithAdvantage(
  die: DieType,
  advantage: "none" | "advantage" | "disadvantage",
): { value: number; rolls: number[] } {
  if (advantage === "none") {
    const val = rollDie(die);
    return { value: val, rolls: [val] };
  }
  const r1 = rollDie(die);
  const r2 = rollDie(die);
  const value =
    advantage === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
  return { value, rolls: [r1, r2] };
}

export function calculateModifier(stat: number): number {
  return Math.floor((stat - 10) / 2);
}

export function determineResult(
  total: number,
  dc: number,
  rawRoll: number,
  dieType: DieType,
): "success" | "failure" | "critical_success" | "critical_failure" {
  if (dieType === "d20") {
    if (rawRoll === 20) return "critical_success";
    if (rawRoll === 1) return "critical_failure";
  }
  return total >= dc ? "success" : "failure";
}
