import { describe, expect, it } from "vitest";

import { resolvePlayerDisplayName } from "@/lib/session/player-display-name";

describe("resolvePlayerDisplayName", () => {
  it("prefers character name", () => {
    expect(
      resolvePlayerDisplayName({
        characterName: "Aria",
        userName: "Adventurer",
        userEmail: "x@y.com",
      }),
    ).toBe("Aria");
  });

  it("uses non-generic user name", () => {
    expect(
      resolvePlayerDisplayName({
        characterName: null,
        userName: "Hasan",
        userEmail: "h@example.com",
      }),
    ).toBe("Hasan");
  });

  it("falls back to email local part when name is default Adventurer", () => {
    expect(
      resolvePlayerDisplayName({
        characterName: undefined,
        userName: "Adventurer",
        userEmail: "hasan@example.com",
      }),
    ).toBe("hasan");
  });

  it("keeps Adventurer when no better hint exists", () => {
    expect(
      resolvePlayerDisplayName({
        characterName: null,
        userName: "Adventurer",
        userEmail: null,
      }),
    ).toBe("Adventurer");
  });
});
