import {
  buildPremiseFingerprint,
  inferPresetPackFromPremise,
  type PresetPackId,
} from "@/lib/rules/class-presets";
import { RACES, type CharacterRace } from "@/lib/rules/character";

/**
 * Same `value` keys as `RACES` for DB/rules; `label` follows the table premise
 * (same fingerprint as class cards / starting gear).
 */
const RACE_LABELS: Record<PresetPackId, Record<CharacterRace, string>> = {
  fantasy: {
    human: "Human",
    elf: "Elf",
    dwarf: "Dwarf",
    halfling: "Halfling",
    half_orc: "Half-Orc",
    tiefling: "Tiefling",
  },
  sci_fi: {
    human: "Baseline / Terran",
    elf: "Long-cycle lineage",
    dwarf: "Heavy-world stock",
    halfling: "Compact genotype",
    half_orc: "Hybrid vigor strain",
    tiefling: "Gene-marked",
  },
  modern: {
    human: "Human",
    elf: "Old bloodline look",
    dwarf: "Stocky heritage",
    halfling: "Small-stature kin",
    half_orc: "Tough mix",
    tiefling: "Striking traits",
  },
  horror: {
    human: "Ordinary survivor",
    elf: "Uncanny grace",
    dwarf: "Grim resolve",
    halfling: "Soft-footed",
    half_orc: "Brutal edge",
    tiefling: "Wrong-side blood",
  },
  neutral: {
    human: "Human",
    elf: "Elven heritage",
    dwarf: "Dwarven heritage",
    halfling: "Smallfolk",
    half_orc: "Mixed heritage",
    tiefling: "Marked heritage",
  },
};

export function getRacesForPremise(params: {
  adventure_prompt?: string | null;
  adventure_tags?: string[] | null;
  world_bible?: string | null;
}): { value: CharacterRace; label: string }[] {
  const pack = inferPresetPackFromPremise(buildPremiseFingerprint(params));
  const row = RACE_LABELS[pack];
  return RACES.map((r) => ({
    value: r.value,
    label: row[r.value],
  }));
}
