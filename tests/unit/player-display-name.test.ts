import { describe, expect, it } from "vitest";

import {
  mergeViewerUserFieldsForPlayer,
  resolvePlayerDisplayName,
} from "@/lib/session/player-display-name";

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

describe("mergeViewerUserFieldsForPlayer", () => {
  const viewer = {
    userId: "u1",
    email: "hasan@example.com",
    name: "Adventurer",
  };

  it("fills missing DB email from viewer for that player only", () => {
    expect(
      mergeViewerUserFieldsForPlayer({
        playerUserId: "u1",
        dbUserName: "Adventurer",
        dbUserEmail: null,
        viewer,
      }),
    ).toEqual({
      userName: "Adventurer",
      userEmail: "hasan@example.com",
    });
  });

  it("does not inject viewer email for other players", () => {
    expect(
      mergeViewerUserFieldsForPlayer({
        playerUserId: "u2",
        dbUserName: "Adventurer",
        dbUserEmail: null,
        viewer,
      }),
    ).toEqual({ userName: "Adventurer", userEmail: undefined });
  });
});
