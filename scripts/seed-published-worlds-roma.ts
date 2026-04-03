/**
 * Phase 2: upsert published `worlds` rows from `ROMA_MODULES` + `ROMA_SEEDS`.
 * Idempotent on `slug`. Requires `DATABASE_URL` and migrations through `0014` (`worlds` + metrics).
 *
 * @see docs/WORLDS_CATALOG_IMPLEMENTATION_PHASES.md — Phase 2
 */
import { loadEnvConfig } from "@next/env";
import { db } from "@/lib/db";
import { worlds } from "@/lib/db/schema";
import { ROMA_MODULES } from "@/lib/rome/modules";
import { ROMA_SEEDS } from "@/lib/rome/seeder";
import { FEATURED_WORLD_MODULE_KEY } from "@/lib/worlds/featured-slug";

loadEnvConfig(process.cwd());

function moduleKeyToSlug(key: string): string {
  return key.replace(/_/g, "-");
}

async function main() {
  const now = new Date();
  for (let i = 0; i < ROMA_MODULES.length; i++) {
    const mod = ROMA_MODULES[i];
    if (!mod) continue;
    const seed = ROMA_SEEDS[mod.key];
    const slug = moduleKeyToSlug(mod.key);
    const snapshot_definition: Record<string, unknown> = {
      theme: seed.theme,
      stylePolicyAddon: seed.stylePolicyAddon,
      visualBibleSeed: seed.visualBibleSeed,
      tags: mod.tags,
    };

    const isFeatured = mod.key === FEATURED_WORLD_MODULE_KEY;

    await db
      .insert(worlds)
      .values({
        slug,
        title: mod.title,
        subtitle: mod.pitch,
        description: seed.theme,
        status: "published",
        sort_order: i,
        module_key: mod.key,
        campaign_mode_default: "module",
        default_max_players: null,
        snapshot_definition,
        published_revision: 1,
        is_featured: isFeatured,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: worlds.slug,
        set: {
          title: mod.title,
          subtitle: mod.pitch,
          description: seed.theme,
          status: "published",
          sort_order: i,
          module_key: mod.key,
          campaign_mode_default: "module",
          default_max_players: null,
          snapshot_definition,
          published_revision: 1,
          is_featured: isFeatured,
          updated_at: new Date(),
        },
      });
  }
  console.log(`Upserted ${ROMA_MODULES.length} published worlds from Roma seeds.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
