import { describe, expect, it } from "vitest";

import {
  buildNextPartyConfigAfterVote,
  fillPartyAutoVotes,
  listParticipantsWhoMustVote,
  pickAutoVoteTarget,
  pickVoteWinner,
  shouldPartyRevealAfterVote,
} from "@/lib/party/party-vote-resolution";
import type { PartyConfigV1 } from "@/lib/schemas/party";

const iso = (s: number) => () =>
  new Date(Date.now() + s * 1000).toISOString();

function baseCfg(over: Partial<PartyConfigV1> = {}): PartyConfigV1 {
  return {
    version: 1,
    template_key: "default",
    party_phase: "vote",
    round_index: 1,
    total_rounds: 3,
    carry_forward: null,
    submissions: {
      a: { text: "line a", submitted_at: "t" },
      b: { text: "line b", submitted_at: "t" },
    },
    votes_this_round: {},
    vp_totals: {},
    fp_totals: {},
    merged_beat: "merged",
    ...over,
  };
}

describe("pickVoteWinner", () => {
  it("breaks ties with lexicographic player id", () => {
    const w = pickVoteWinner(
      { x: "a", y: "a", z: "b" },
      ["a", "b"],
    );
    expect(w).toBe("a");
  });
});

describe("pickAutoVoteTarget", () => {
  it("excludes self and picks lowest id", () => {
    expect(pickAutoVoteTarget("b", ["a", "b", "c"])).toBe("a");
    expect(pickAutoVoteTarget("a", ["a"])).toBeNull();
  });
});

describe("listParticipantsWhoMustVote", () => {
  it("omits sole submitter when alone", () => {
    const ids = listParticipantsWhoMustVote(["a"], ["a"]);
    expect(ids).toEqual([]);
  });

  it("includes non-submitters who can vote", () => {
    const ids = listParticipantsWhoMustVote(["a", "b"], ["a"]);
    expect(ids).toEqual(["b"]);
  });
});

describe("fillPartyAutoVotes", () => {
  it("fills missing votes deterministically", () => {
    const votes = fillPartyAutoVotes({
      participantIds: ["a", "b"],
      submissionPlayerIds: ["a", "b"],
      votes: { a: "b" },
    });
    expect(votes.b).toBe("a");
  });
});

describe("buildNextPartyConfigAfterVote", () => {
  it("advances to submit with carry and VP", () => {
    const cfg = baseCfg();
    const next = buildNextPartyConfigAfterVote({
      cfg,
      votes: { a: "b", b: "a" },
      submissionPlayerIds: ["a", "b"],
      isoDeadlineFromNow: iso(60),
      submitDeadlineSec: 60,
    });
    expect(next.party_phase).toBe("submit");
    expect(next.round_index).toBe(2);
    // Tie-break: sorted submission id `a` wins at 1 vote each.
    expect(next.vp_totals?.a).toBe(1);
    expect(next.carry_forward).toBe("line a");
    expect(next.merged_beat).toBeNull();
  });

  it("respects forcedWinner", () => {
    const cfg = baseCfg();
    const next = buildNextPartyConfigAfterVote({
      cfg,
      votes: {},
      submissionPlayerIds: ["a"],
      forcedWinner: "a",
      isoDeadlineFromNow: iso(60),
      submitDeadlineSec: 60,
    });
    expect(next.vp_totals?.a).toBe(1);
  });

  it("ends on last round", () => {
    const cfg = baseCfg({ round_index: 3, total_rounds: 3 });
    const next = buildNextPartyConfigAfterVote({
      cfg,
      votes: { a: "b", b: "a" },
      submissionPlayerIds: ["a", "b"],
      isoDeadlineFromNow: iso(60),
      submitDeadlineSec: 60,
    });
    expect(next.party_phase).toBe("ended");
  });

  it("goes to reveal when instigator slots are present", () => {
    const cfg = baseCfg({
      submission_slots_public: [
        { slot_id: "s1", text: "a" },
        { slot_id: "s2", text: "b" },
      ],
      instigator_slot_id: "s2",
      slot_attribution: { s1: "player", s2: "forgery" },
      forgery_guesses: { a: "s1", b: "s2" },
    });
    expect(shouldPartyRevealAfterVote(cfg)).toBe(true);
    const next = buildNextPartyConfigAfterVote({
      cfg,
      votes: { a: "b", b: "a" },
      submissionPlayerIds: ["a", "b"],
      isoDeadlineFromNow: iso(60),
      submitDeadlineSec: 60,
    });
    expect(next.party_phase).toBe("reveal");
    expect(next.fp_totals?.b).toBe(1);
  });
});
