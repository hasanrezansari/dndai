import { describe, expect, it } from "vitest";

import type { TurnContext } from "@/lib/orchestrator/context-builder";
import {
  buildHumanDmBetrayalBriefing,
  buildBetrayalSpineForNarrator,
  shouldApplyBetrayalNarratorInterrupt,
} from "@/lib/orchestrator/betrayal-pipeline";

function baseCtx(over: Partial<TurnContext>): TurnContext {
  return {
    session: {
      mode: "ai_dm",
      gameKind: "campaign",
      phase: "exploration",
      campaignTitle: "Test",
      adventurePrompt: null,
      currentRound: 1,
      chapterIndex: 1,
      campaignMode: "user_prompt",
      moduleKey: null,
      adventureTags: null,
      artDirection: null,
      worldBible: null,
    },
    player: { id: "p-host", seatIndex: 0, isHost: true },
    character: {
      name: "Hero",
      class: "warrior",
      mechanicalClass: "warrior",
      race: "human",
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      hp: 10,
      maxHp: 10,
      mana: 5,
      maxMana: 5,
      conditions: [],
      pronouns: "they/them",
      traits: [],
      backstory: "",
      appearance: "",
      classProfile: null,
      classIdentitySummary: "Human Warrior",
    },
    recentEvents: [],
    currentSceneDescription: null,
    allPlayerNames: ["A", "B"],
    allCharacterSummaries: [],
    partyMembers: [
      {
        playerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Aeris",
        hp: 10,
        maxHp: 10,
        mana: 5,
        maxMana: 5,
        conditions: [],
      },
    ],
    npcDetails: [],
    questContext: null,
    betrayalMode: "off",
    betrayalPhase: null,
    betrayalOutcomeId: null,
    betrayalInstigatorPlayerId: null,
    betrayalTraitorPlayerId: null,
    npcContext: null,
    npcIds: [],
    nextPlayerName: "",
    nextPlayerId: "",
    roundAdvanced: false,
    ...over,
  };
}

describe("betrayal pipeline helpers", () => {
  it("buildBetrayalSpineForNarrator returns null when betrayal off", () => {
    expect(buildBetrayalSpineForNarrator(baseCtx({}))).toBeNull();
  });

  it("includes instigator character name when set", () => {
    const s = buildBetrayalSpineForNarrator(
      baseCtx({
        betrayalMode: "story_only",
        betrayalPhase: "idle",
        betrayalInstigatorPlayerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    );
    expect(s).toContain("instigator_pc=Aeris");
    expect(s).toContain("mode=story_only");
  });

  it("shouldApplyBetrayalNarratorInterrupt only for confrontational live beats", () => {
    expect(
      shouldApplyBetrayalNarratorInterrupt(
        baseCtx({
          betrayalMode: "confrontational",
          betrayalPhase: "rogue_intent",
        }),
      ),
    ).toBe(true);
    expect(
      shouldApplyBetrayalNarratorInterrupt(
        baseCtx({
          betrayalMode: "confrontational",
          betrayalPhase: "idle",
        }),
      ),
    ).toBe(false);
    expect(
      shouldApplyBetrayalNarratorInterrupt(
        baseCtx({
          betrayalMode: "story_only",
          betrayalPhase: "idle",
        }),
      ),
    ).toBe(false);
  });

  it("buildHumanDmBetrayalBriefing returns confrontation prompts", () => {
    const out = buildHumanDmBetrayalBriefing(
      baseCtx({
        betrayalMode: "confrontational",
        betrayalPhase: "confronting",
      }),
    );
    expect(out).not.toBeNull();
    expect(out?.spine).toContain("phase=confronting");
    expect(out?.prompts.length).toBeGreaterThan(0);
  });

  it("buildHumanDmBetrayalBriefing returns null when mode off", () => {
    const out = buildHumanDmBetrayalBriefing(
      baseCtx({
        betrayalMode: "off",
        betrayalPhase: null,
      }),
    );
    expect(out).toBeNull();
  });
});
