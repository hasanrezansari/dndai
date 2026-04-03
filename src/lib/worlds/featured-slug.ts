import type { RomaModuleKey } from "@/lib/rome/modules";

/** Module key for the default hero / cold-start featured Roma world. */
export const FEATURED_WORLD_MODULE_KEY =
  "roma_gladiator_uprising" satisfies RomaModuleKey;

/** URL slug (`module_key` with underscores → hyphens). */
export const FEATURED_WORLD_SLUG = FEATURED_WORLD_MODULE_KEY.replace(
  /_/g,
  "-",
);
