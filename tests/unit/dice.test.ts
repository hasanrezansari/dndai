import { describe, expect, it } from "vitest";

import {
  calculateModifier,
  determineResult,
  rollDie,
  rollWithAdvantage,
  type DieType,
} from "@/lib/rules/dice";

const DIE_TYPES: DieType[] = ["d4", "d6", "d8", "d10", "d12", "d20"];

const MAX: Record<DieType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
};

describe("rollDie", () => {
  it.each(DIE_TYPES)("returns value in range for %s", (die) => {
    const max = MAX[die];
    for (let i = 0; i < 40; i++) {
      const v = rollDie(die);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(max);
    }
  });
});

describe("rollWithAdvantage", () => {
  it("with advantage uses the higher of two rolls", () => {
    for (let i = 0; i < 60; i++) {
      const { value, rolls } = rollWithAdvantage("d20", "advantage");
      expect(rolls).toHaveLength(2);
      expect(value).toBe(Math.max(rolls[0]!, rolls[1]!));
    }
  });

  it("with disadvantage uses the lower of two rolls", () => {
    for (let i = 0; i < 60; i++) {
      const { value, rolls } = rollWithAdvantage("d20", "disadvantage");
      expect(rolls).toHaveLength(2);
      expect(value).toBe(Math.min(rolls[0]!, rolls[1]!));
    }
  });
});

describe("calculateModifier", () => {
  it("matches D&D modifiers", () => {
    expect(calculateModifier(10)).toBe(0);
    expect(calculateModifier(14)).toBe(2);
    expect(calculateModifier(8)).toBe(-1);
    expect(calculateModifier(20)).toBe(5);
  });
});

describe("determineResult", () => {
  it("nat 20 on d20 is critical_success", () => {
    expect(determineResult(5, 30, 20, "d20")).toBe("critical_success");
  });

  it("nat 1 on d20 is critical_failure", () => {
    expect(determineResult(25, 10, 1, "d20")).toBe("critical_failure");
  });

  it("total >= dc is success when not nat 1/20", () => {
    expect(determineResult(15, 15, 10, "d20")).toBe("success");
    expect(determineResult(14, 15, 10, "d20")).toBe("failure");
  });

  it("non-d20 uses total vs dc only", () => {
    expect(determineResult(10, 10, 1, "d6")).toBe("success");
    expect(determineResult(9, 10, 1, "d6")).toBe("failure");
  });
});
