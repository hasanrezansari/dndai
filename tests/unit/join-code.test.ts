import { describe, expect, it } from "vitest";

import {
  isValidJoinCodeFormat,
  normalizeJoinCodeForLookup,
} from "@/lib/join-code";

describe("join-code", () => {
  it("normalizes trim and case", () => {
    expect(normalizeJoinCodeForLookup("  ab12cd  ")).toBe("AB12CD");
  });

  it("accepts six chars from alphabet", () => {
    expect(isValidJoinCodeFormat("AB23CD")).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(isValidJoinCodeFormat("ABC")).toBe(false);
    expect(isValidJoinCodeFormat("ABCDEFG")).toBe(false);
  });

  it("rejects ambiguous or out-of-alphabet chars", () => {
    expect(isValidJoinCodeFormat("ABCI12")).toBe(false); // no I
    expect(isValidJoinCodeFormat("AB0123")).toBe(false); // no 0/1
  });
});
