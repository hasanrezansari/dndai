import type { RomaModuleKey } from "@/lib/rome/modules";

export type RomaSeed = {
  theme: string;
  stylePolicyAddon: string;
  visualBibleSeed: {
    palette: string;
    motifs: string;
    architecture: string;
  };
};

export const ROMA_SEEDS: Record<RomaModuleKey, RomaSeed> = {
  roma_gladiator_uprising: {
    theme:
      "Ancient Rome: the arena underworld, corrupt lanistae, blood-soaked spectacle, and a brewing gladiator revolt.",
    stylePolicyAddon:
      "Write like a grounded historical thriller with cinematic grit. Use Roman terms sparingly (legion, centurion, praetor, forum). Avoid modern slang. Keep magic minimal or nonexistent unless explicitly introduced as superstition or cult ritual.",
    visualBibleSeed: {
      palette: "warm torchlight golds, blood-dark reds, soot-black shadows, sun-bleached stone",
      motifs: "sand, iron, laurel, chained gates, marble dust, roaring crowd silhouettes",
      architecture: "colosseum corridors, vaulted stone arches, iron portcullises, cramped barracks",
    },
  },
  roma_senate_intrigue: {
    theme:
      "Ancient Rome: Senate intrigue, patronage networks, betrayals, and political violence behind marble civility.",
    stylePolicyAddon:
      "Write with tense, elegant menace. Keep dialogue sharp and subtle. Avoid fantasy tropes; keep threats human. Use Roman civic details (toga, fasces, lictors) when useful, not as trivia dumps.",
    visualBibleSeed: {
      palette: "cool marble whites, candlelit ambers, ink-black, muted gold accents",
      motifs: "wax seals, scrolls, shadowed colonnades, laurel wreaths, hidden knives",
      architecture: "forum basilicas, senate chambers, atrium houses, colonnades",
    },
  },
  roma_legion_frontier: {
    theme:
      "Ancient Rome: a legion outpost on a cold frontier, supply lines fraying, enemies unseen in forests and fog.",
    stylePolicyAddon:
      "Write as harsh survival drama. Keep stakes practical: weather, hunger, morale, ambushes. Avoid overt magic; superstition is fine. Make the world feel vast and indifferent.",
    visualBibleSeed: {
      palette: "cold steel blues, pine greens, ember oranges, mud browns",
      motifs: "standards, shields, frost breath, watchfires, wolf tracks",
      architecture: "timber palisades, earthen ramparts, cramped tents, watchtowers",
    },
  },
  roma_pompeii_mystery: {
    theme:
      "Ancient Pompeii: a tense mystery in a living city under an ominous mountain, with secrets in villas and baths.",
    stylePolicyAddon:
      "Write with creeping dread and investigative clarity. Keep clues concrete. Avoid time-travel and modern references. Supernatural hints should stay ambiguous until proven.",
    visualBibleSeed: {
      palette: "sunlit terracotta, smoky greys, sea blues, volcanic ash blacks",
      motifs: "frescoes, steam, ash flecks, sealed doors, distant rumble",
      architecture: "bathhouses, frescoed villas, narrow streets, market stalls",
    },
  },
  roma_catacomb_cult: {
    theme:
      "Ancient Rome: catacombs beneath the city, forbidden rites, a secret cult, and dangerous underground passages.",
    stylePolicyAddon:
      "Write as claustrophobic horror-lite. Keep the fear visceral but not graphic. Cult ritual can imply the uncanny, but avoid explicit high fantasy spellcasting.",
    visualBibleSeed: {
      palette: "pitch-black, torch amber, bone ivory, sickly green shadows",
      motifs: "dripping stone, carved symbols, bones, whispered prayers, smoke trails",
      architecture: "tight tunnels, burial niches, underground chambers, crumbling stairs",
    },
  },
};

