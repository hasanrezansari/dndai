export type RomaModuleKey =
  | "roma_gladiator_uprising"
  | "roma_senate_intrigue"
  | "roma_legion_frontier"
  | "roma_pompeii_mystery"
  | "roma_catacomb_cult";

export type RomaModule = {
  key: RomaModuleKey;
  title: string;
  pitch: string;
  tags: string[];
};

export const ROMA_MODULES: RomaModule[] = [
  {
    key: "roma_gladiator_uprising",
    title: "Gladiator Uprising",
    pitch: "Beneath the roar of the arena, a rebellion sparks. Win the crowd—or be crushed by the empire.",
    tags: ["arena", "rebellion", "steel"],
  },
  {
    key: "roma_senate_intrigue",
    title: "Shadows of the Senate",
    pitch: "Whispers, bribes, and daggers in marble halls. Outmaneuver rivals before Rome chooses a new tyrant.",
    tags: ["politics", "deception", "power"],
  },
  {
    key: "roma_legion_frontier",
    title: "Legion on the Frontier",
    pitch: "Winter closes in at the edge of the world. Hold the line, uncover a threat, and bring your cohort home.",
    tags: ["legion", "survival", "war"],
  },
  {
    key: "roma_pompeii_mystery",
    title: "The Pompeii Enigma",
    pitch: "A missing magistrate. Strange ash on the breeze. Solve the mystery before the mountain speaks.",
    tags: ["mystery", "omens", "city"],
  },
  {
    key: "roma_catacomb_cult",
    title: "Cult of the Catacombs",
    pitch: "Torches gutter underground. A forbidden cult gathers in the dark. Descend, uncover, and survive the rite.",
    tags: ["horror", "cult", "underground"],
  },
];

