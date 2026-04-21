import { describe, expect, it } from "vitest";

import {
  TURN_READING_GRACE_SEC,
  TURN_TIMEOUT_SEC,
  turnAwaitingInputTotalSec,
} from "@/lib/turn/timeout-config";

describe("turnAwaitingInputTotalSec", () => {
  it("sums reading grace and action timeout", () => {
    expect(turnAwaitingInputTotalSec()).toBe(
      TURN_READING_GRACE_SEC + TURN_TIMEOUT_SEC,
    );
  });
});
