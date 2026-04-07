import { describe, expect, it } from "vitest";

import {
  assertBetrayalPhaseTransition,
  BetrayalStateMachineError,
} from "@/server/services/betrayal-state-machine";

describe("assertBetrayalPhaseTransition", () => {
  it("allows idle → resolved", () => {
    expect(() => assertBetrayalPhaseTransition("idle", "resolved")).not.toThrow();
  });

  it("rejects confronting → rogue_intent", () => {
    expect(() =>
      assertBetrayalPhaseTransition("confronting", "rogue_intent"),
    ).toThrow(BetrayalStateMachineError);
  });
});
