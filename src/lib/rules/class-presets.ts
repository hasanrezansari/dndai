import { CLASSES, type CharacterClass } from "@/lib/rules/character";

/** Preset row for UI: same `value` / art as `CLASSES`, display strings vary by premise. */
export type PresetClassDisplay = Omit<
  (typeof CLASSES)[number],
  "label" | "role" | "fantasy"
> & {
  label: string;
  role: string;
  fantasy: string;
};

export type PresetPackId =
  | "fantasy"
  | "sci_fi"
  | "modern"
  | "horror"
  | "neutral";

const OVERRIDES: Record<
  PresetPackId,
  Record<
    CharacterClass,
    { label: string; role: string; fantasy: string }
  >
> = {
  fantasy: {
    warrior: {
      label: "Warrior",
      role: "Frontline",
      fantasy: "Steel-clad vanguard who breaks enemy lines.",
    },
    ranger: {
      label: "Ranger",
      role: "Skirmisher",
      fantasy: "Tracker and archer who controls distance.",
    },
    mage: {
      label: "Mage",
      role: "Arcane",
      fantasy: "Spellcaster shaping the battlefield with magic.",
    },
    rogue: {
      label: "Rogue",
      role: "Stealth",
      fantasy: "Shadow operative striking where defenses are weak.",
    },
    cleric: {
      label: "Cleric",
      role: "Support",
      fantasy: "Divine guide who protects and restores allies.",
    },
    paladin: {
      label: "Paladin",
      role: "Guardian",
      fantasy: "Holy champion blending defense and judgment.",
    },
  },
  sci_fi: {
    warrior: {
      label: "Breach Specialist",
      role: "Frontline",
      fantasy: "Powered-armor or heavy-weapons anchor who seizes and holds ground.",
    },
    ranger: {
      label: "Pathfinder",
      role: "Skirmisher",
      fantasy: "Scout-sniper or drone-handler who owns angles and distance.",
    },
    mage: {
      label: "Technopath",
      role: "Arcane",
      fantasy: "Hacker, psion, or field engineer who bends systems and energy to the mission.",
    },
    rogue: {
      label: "Infiltrator",
      role: "Stealth",
      fantasy: "Ghost in ducts and networks—quiet entry, quiet exit.",
    },
    cleric: {
      label: "Field Medic",
      role: "Support",
      fantasy: "Combat medic or morale officer who keeps the crew on their feet.",
    },
    paladin: {
      label: "Warden",
      role: "Guardian",
      fantasy: "Loyal enforcer of ship, corps, or code—shield and judgment in one.",
    },
  },
  modern: {
    warrior: {
      label: "Operator",
      role: "Frontline",
      fantasy: "Door-kicker or brawler who dominates close quarters.",
    },
    ranger: {
      label: "Scout",
      role: "Skirmisher",
      fantasy: "Driver, spotter, or overwatch—always one move ahead.",
    },
    mage: {
      label: "Analyst",
      role: "Arcane",
      fantasy: "Forensics, logistics, or occult know-how that turns chaos into a plan.",
    },
    rogue: {
      label: "Fixer",
      role: "Stealth",
      fantasy: "Social engineer or cat-burglar who opens doors others never see.",
    },
    cleric: {
      label: "Medic",
      role: "Support",
      fantasy: "Stabilizes bodies and nerves when the job goes loud.",
    },
    paladin: {
      label: "Shield",
      role: "Guardian",
      fantasy: "Bodyguard or detective who stands between innocents and harm.",
    },
  },
  horror: {
    warrior: {
      label: "Survivor",
      role: "Frontline",
      fantasy: "Keeps the group alive with grit, improvised weapons, and refusal to break.",
    },
    ranger: {
      label: "Hunter",
      role: "Skirmisher",
      fantasy: "Tracks threats, reads omens, strikes before the dark closes in.",
    },
    mage: {
      label: "Occultist",
      role: "Arcane",
      fantasy: "Knows the wrong names and the right wards—power with a price.",
    },
    rogue: {
      label: "Lurk",
      role: "Stealth",
      fantasy: "Slips through blind spots—first to see what should not be seen.",
    },
    cleric: {
      label: "Witness",
      role: "Support",
      fantasy: "Faith, therapy, or stubborn hope—whatever holds sanity together.",
    },
    paladin: {
      label: "Avenger",
      role: "Guardian",
      fantasy: "Turns fear into resolve; the wall between the table and the abyss.",
    },
  },
  neutral: {
    warrior: {
      label: "Vanguard",
      role: "Frontline",
      fantasy: "Anchor who absorbs pressure and creates space for allies.",
    },
    ranger: {
      label: "Skirmisher",
      role: "Skirmisher",
      fantasy: "Mobile fighter who punishes mistakes and controls distance.",
    },
    mage: {
      label: "Weaver",
      role: "Arcane",
      fantasy: "Specialist whose trained techniques reshape the field.",
    },
    rogue: {
      label: "Infiltrator",
      role: "Stealth",
      fantasy: "Strikes where defenses are thin; information and leverage first.",
    },
    cleric: {
      label: "Support",
      role: "Support",
      fantasy: "Keeps allies effective under fire—repair, rally, restore.",
    },
    paladin: {
      label: "Guardian",
      role: "Guardian",
      fantasy: "Blends protection and authority; holds the line when stakes peak.",
    },
  },
};

/** Exported for tests — scores premise text + tags for a display pack. */
export function inferPresetPackFromPremise(fingerprint: string): PresetPackId {
  const t = fingerprint.toLowerCase();
  if (
    /\b(sci[-\s]?fi|science fiction|spaceship|starship|space station|android|cyborg|cyberpunk|neon|orbital|laser|warp|ftl|hologram|mech|droid)\b/.test(
      t,
    )
  ) {
    return "sci_fi";
  }
  if (
    /\b(noir|detective|police|federal|agency|corporate espionage|heist|subway|skyscraper|modern day|present[-\s]?day|urban fantasy|contemporary)\b/.test(
      t,
    )
  ) {
    return "modern";
  }
  if (
    /\b(horror|eldritch|haunted|cosmic horror|lovecraft|cult|ghost|undead|dread)\b/.test(
      t,
    )
  ) {
    return "horror";
  }
  if (
    /\b(high fantasy|sword|sorcery|dragon|knight|paladin|dungeon|medieval|castle|wizard|elf|dwarf)\b/.test(
      t,
    )
  ) {
    return "fantasy";
  }
  return "neutral";
}

/** Joins tags + prompt + world bible for pack inference (same signal as class cards). */
export function buildPremiseFingerprint(params: {
  adventure_prompt?: string | null;
  adventure_tags?: string[] | null;
  world_bible?: string | null;
}): string {
  const parts = [
    ...(params.adventure_tags ?? []).map(String),
    params.adventure_prompt ?? "",
    params.world_bible ?? "",
  ];
  return parts.join(" ").trim();
}

/**
 * Same mechanical `value` keys as `CLASSES` (warrior, mage, …) for rules/DB;
 * `label`, `role`, and `fantasy` blurbs follow the table’s premise when detectable.
 */
export function getPresetClassesForPremise(params: {
  adventure_prompt?: string | null;
  adventure_tags?: string[] | null;
  world_bible?: string | null;
}): PresetClassDisplay[] {
  const pack = inferPresetPackFromPremise(buildPremiseFingerprint(params));
  const row = OVERRIDES[pack];
  return CLASSES.map((base) => ({
    ...base,
    ...row[base.value],
  }));
}
