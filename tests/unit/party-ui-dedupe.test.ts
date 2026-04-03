import { describe, expect, it } from "vitest";

import { isPartyBlockShownInScene } from "@/lib/party/party-ui-dedupe";

describe("isPartyBlockShownInScene", () => {
  it("returns false when either side empty", () => {
    expect(isPartyBlockShownInScene("", "hello")).toBe(false);
    expect(isPartyBlockShownInScene("hello", "")).toBe(false);
  });

  it("returns true for exact match after whitespace norm", () => {
    expect(isPartyBlockShownInScene("a  b", "a b")).toBe(true);
  });

  it("returns true when scene contains carry block", () => {
    const scene = "Opener\n\nWhere we left off: The party danced.";
    const carry = "The party danced.";
    expect(isPartyBlockShownInScene(scene, carry)).toBe(true);
  });

  it("returns false when carry is genuinely new", () => {
    expect(isPartyBlockShownInScene("Short opener.", "Different epilogue text.")).toBe(
      false,
    );
  });
});
