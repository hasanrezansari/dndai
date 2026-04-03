import { describe, expect, it } from "vitest";

import {
  buildFacilitatorRoleLine,
  buildOpenRouterSceneSystemPrompt,
  buildStyleHintForSession,
  buildToneBiasFromAdventureTags,
  isPlayRomanaModuleKey,
} from "@/lib/ai/narrative-session-profile";

describe("narrative-session-profile", () => {
  it("open user_prompt uses facilitator without fixed genre", () => {
    const line = buildFacilitatorRoleLine({
      campaign_mode: "user_prompt",
      module_key: null,
      adventure_prompt: "Bike trip in Sikkim",
      adventure_tags: ["wholesome"],
      art_direction: null,
      world_bible: null,
    });
    expect(line).toContain("collaborative tabletop RPG");
    expect(line).toContain("wholesome");
    expect(line).toContain("Tone bias (table tags)");
    expect(line.toLowerCase()).not.toContain("dark fantasy");
  });

  it("adds consequence bias for horror without cozy when only weight tags", () => {
    const line = buildFacilitatorRoleLine({
      campaign_mode: "user_prompt",
      module_key: null,
      adventure_prompt: null,
      adventure_tags: ["horror"],
      art_direction: null,
      world_bible: null,
    });
    expect(line).toContain("outcomes echo");
    expect(line).not.toContain("warmth, rapport");
  });

  it("buildToneBiasFromAdventureTags returns empty for unknown tag ids", () => {
    expect(buildToneBiasFromAdventureTags(["custom_tag_xyz"])).toBe("");
  });

  it("PlayRomana module uses curated facilitator line", () => {
    const line = buildFacilitatorRoleLine({
      campaign_mode: "module",
      module_key: "roma_gladiator_uprising",
      adventure_prompt: null,
      adventure_tags: null,
      art_direction: null,
      world_bible: null,
    });
    expect(line).toContain("PlayRomana");
    expect(line).toContain("Ancient Rome");
  });

  it("isPlayRomanaModuleKey rejects unknown keys", () => {
    expect(isPlayRomanaModuleKey("tutorial_v1")).toBe(false);
    expect(isPlayRomanaModuleKey("roma_pompeii_mystery")).toBe(true);
  });

  it("buildStyleHintForSession merges art direction and Roman visual bible", () => {
    const h = buildStyleHintForSession({
      campaign_mode: "module",
      module_key: "roma_gladiator_uprising",
      adventure_prompt: null,
      adventure_tags: null,
      art_direction: "warm painterly light",
      world_bible: null,
    });
    expect(h).toContain("warm painterly light");
    expect(h.toLowerCase()).toContain("torchlight");
  });

  it("buildOpenRouterSceneSystemPrompt stays genre-neutral without hint", () => {
    const s = buildOpenRouterSceneSystemPrompt({
      campaign_mode: "user_prompt",
      module_key: null,
      adventure_prompt: null,
      adventure_tags: null,
      art_direction: null,
      world_bible: null,
    });
    expect(s.toLowerCase()).not.toContain("dark fantasy");
    expect(s).toContain("illustrator");
  });
});
