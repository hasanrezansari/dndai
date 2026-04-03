import { getBuildTimeBrand, type AppBrand } from "@/lib/brand";
import type { PartySecretRoleTemplate } from "@/lib/schemas/party-secrets";

/** Default Jackbox-style template when none is chosen at create time. */
export const DEFAULT_PARTY_TEMPLATE_KEY = "default";

export const DEFAULT_PARTY_TOTAL_ROUNDS = 6;

/** Seconds for the submit phase before auto-merge with whatever lines exist. */
export const PARTY_SUBMIT_DEADLINE_SEC = 120;

/** Seconds for the vote phase before server assigns missing votes and tallies. */
export const PARTY_VOTE_DEADLINE_SEC = 90;

/** Guess which anonymous line was the instigator (after merge, before crowd vote). */
export const PARTY_FORGERY_GUESS_DEADLINE_SEC = 75;

/** Short beat to show forgery reveal + bonus points before the next round. */
export const PARTY_REVEAL_DEADLINE_SEC = 25;

export type PartyTemplatePack = {
  /** Fed to merge AI as structural guidance for the whole pack. */
  mergeSpine: string;
  /** Optional short milestone line per round index (1-based). */
  roundMilestones?: Partial<Record<number, string>>;
};

const DEFAULT_PACK: PartyTemplatePack = {
  mergeSpine:
    "Each round is a collaborative beat: honor every player line, keep continuity with carry_forward when present, and land on one vivid moment the table can react to.",
  roundMilestones: {
    1: "Establish the situation and tone.",
    2: "Complicate or twist what was established.",
    3: "Raise stakes or reveal something unexpected.",
    4: "Force a choice or collision between threads.",
    5: "Consequences land; the room reacts.",
    6: "Close the arc with a memorable beat.",
  },
};

const PACKS: Record<string, PartyTemplatePack> = {
  default: DEFAULT_PACK,
  falvos_party_v1: {
    mergeSpine: `${DEFAULT_PACK.mergeSpine} Keep it playable in any genre the table chose — no default fantasy dressing.`,
    roundMilestones: DEFAULT_PACK.roundMilestones,
  },
  playromana_party_v1: {
    mergeSpine:
      "Roman social table: the forum, household, bath, or street — wit, obligation, and rumor matter as much as action. No modern idioms. Supernatural is rare and framed as superstition unless the premise says otherwise.",
    roundMilestones: {
      1: "Arrival — who is present and what do they want?",
      2: "A rumor or letter tilts the room.",
      3: "Duty vs desire — someone must choose.",
      4: "Public face vs private truth collides.",
      5: "Alliances shift; a debt is called.",
      6: "Exit beat — reputation won or lost.",
    },
  },
};

export function getPartyTemplatePack(templateKey: string): PartyTemplatePack {
  return PACKS[templateKey] ?? DEFAULT_PACK;
}

export function getPartyRoundMilestone(
  templateKey: string,
  roundIndex: number,
): string {
  const m = getPartyTemplatePack(templateKey).roundMilestones?.[roundIndex];
  return typeof m === "string" ? m.trim() : "";
}

const BRAND_DEFAULT_TEMPLATE: Record<AppBrand, string> = {
  falvos: "falvos_party_v1",
  playromana: "playromana_party_v1",
};

/**
 * Template key stored in `party_config.template_key` for new party sessions.
 * Host can override via create API; this is the fallback.
 */
export function getDefaultPartyTemplateKeyForBrand(): string {
  const brand = getBuildTimeBrand();
  return BRAND_DEFAULT_TEMPLATE[brand] ?? DEFAULT_PARTY_TEMPLATE_KEY;
}

/** Optional secret-role layer (BP track); counts follow PARTY_MODE_SPEC (4–5 → 1, 6 → 2). */
export type PartySecretTemplatePack = {
  enabled: boolean;
  pool: PartySecretRoleTemplate[];
};

const NEUTRAL_SECRET_POOL: PartySecretRoleTemplate[] = [
  {
    roleKey: "rumor_artist",
    label: "Rumor artist",
    objectives: [
      {
        id: "use_rumor",
        text: "Work the word “rumor” (or “rumour”) into one of your lines.",
        keyword: "rumor",
      },
    ],
  },
  {
    roleKey: "quiet_debt",
    label: "Quiet creditor",
    objectives: [
      {
        id: "use_debt",
        text: "Work the word “debt” into one of your lines.",
        keyword: "debt",
      },
    ],
  },
  {
    roleKey: "iron_favor",
    label: "Favor broker",
    objectives: [
      {
        id: "use_favor",
        text: "Work the word “favor” (or “favour”) into one of your lines.",
        keyword: "favor",
      },
    ],
  },
];

const ROMAN_SECRET_POOL: PartySecretRoleTemplate[] = [
  {
    roleKey: "house_spy",
    label: "Household informer",
    objectives: [
      {
        id: "use_reputation",
        text: "Mention “reputation” in a line without sounding accusatory.",
        keyword: "reputation",
      },
    ],
  },
  {
    roleKey: "patron_strings",
    label: "Hidden patron",
    objectives: [
      {
        id: "use_patron",
        text: "Reference a “patron” (or patronus) in one line.",
        keyword: "patron",
      },
    ],
  },
  {
    roleKey: "omen_reader",
    label: "Omen reader",
    objectives: [
      {
        id: "use_omen",
        text: "Slip “omen” into a line as superstition, not prophecy spam.",
        keyword: "omen",
      },
    ],
  },
];

const SECRET_PACKS: Record<string, PartySecretTemplatePack> = {
  default: { enabled: false, pool: [] },
  falvos_party_v1: { enabled: true, pool: NEUTRAL_SECRET_POOL },
  playromana_party_v1: { enabled: true, pool: ROMAN_SECRET_POOL },
};

export function getPartySecretTemplatePack(
  templateKey: string,
): PartySecretTemplatePack {
  return SECRET_PACKS[templateKey] ?? { enabled: false, pool: [] };
}
