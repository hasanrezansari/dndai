import { describe, expect, it } from "vitest";

import {
  CHARACTER_RACE_MAX_LEN,
  normalizeCharacterRace,
} from "@/lib/rules/character";

describe("normalizeCharacterRace", () => {
  it("maps preset names case-insensitively to canonical keys", () => {
    expect(normalizeCharacterRace("Human")).toEqual({ ok: true, value: "human" });
    expect(normalizeCharacterRace("ELF")).toEqual({ ok: true, value: "elf" });
    expect(normalizeCharacterRace("  dwarf  ")).toEqual({ ok: true, value: "dwarf" });
  });

  it("preserves custom text (trim + collapse spaces)", () => {
    expect(normalizeCharacterRace("  Martian   settler ")).toEqual({
      ok: true,
      value: "Martian settler",
    });
  });

  it("rejects empty", () => {
    expect(normalizeCharacterRace("   ").ok).toBe(false);
  });

  it("rejects UI sentinel if sent raw to API", () => {
    expect(normalizeCharacterRace("__custom__").ok).toBe(false);
  });

  it("rejects overlong custom", () => {
    const long = "x".repeat(CHARACTER_RACE_MAX_LEN + 1);
    const r = normalizeCharacterRace(long);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at most/);
  });

  it("allows custom at max length", () => {
    const s = "x".repeat(CHARACTER_RACE_MAX_LEN);
    expect(normalizeCharacterRace(s)).toEqual({ ok: true, value: s });
  });
});
