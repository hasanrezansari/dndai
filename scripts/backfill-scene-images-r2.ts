/**
 * One-shot migration: upload `scene_snapshots.image_url` rows that still hold `data:...`
 * base64 payloads to R2 (when configured) and replace with public HTTPS URLs.
 *
 * Usage:
 *   DRY_RUN=1 tsx --tsconfig tsconfig.json scripts/backfill-scene-images-r2.ts
 *   tsx --tsconfig tsconfig.json scripts/backfill-scene-images-r2.ts
 *
 * Requires the same R2 env vars as runtime upload (see .env.example).
 */
import { loadEnvConfig } from "@next/env";
import { asc, eq, like } from "drizzle-orm";

import { db } from "@/lib/db";
import { sceneSnapshots } from "@/lib/db/schema";
import {
  isSceneImageObjectStorageConfigured,
  uploadSceneImageBytes,
} from "@/lib/storage/scene-image-storage";

loadEnvConfig(process.cwd());

const BATCH = 15;
const SLEEP_MS = 400;
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!isSceneImageObjectStorageConfigured()) {
    console.error("R2 env not fully configured; aborting.");
    process.exit(1);
  }

  let migrated = 0;
  for (;;) {
    const rows = await db
      .select({
        id: sceneSnapshots.id,
        session_id: sceneSnapshots.session_id,
        image_url: sceneSnapshots.image_url,
      })
      .from(sceneSnapshots)
      .where(like(sceneSnapshots.image_url, "data:%"))
      .orderBy(asc(sceneSnapshots.created_at))
      .limit(BATCH);

    if (rows.length === 0) break;

    for (const row of rows) {
      const raw = row.image_url;
      if (!raw?.startsWith("data:")) continue;
      const match = raw.match(/^data:(image\/[\w+.-]+);base64,([\s\S]+)$/);
      if (!match) {
        console.warn(`[backfill] skip ${row.id}: unparseable data URL`);
        continue;
      }
      const mime = match[1] ?? "image/png";
      const b64 = match[2] ?? "";
      const buf = Buffer.from(b64, "base64");
      const ext = mime.includes("png") ? "png" : "png";
      const key = `sessions/${row.session_id}/scenes/${row.id}.${ext}`;

      if (DRY_RUN) {
        console.log(`[dry-run] would upload ${row.id} (${buf.byteLength} bytes) -> ${key}`);
        migrated++;
        continue;
      }

      const publicUrl = await uploadSceneImageBytes({
        key,
        body: buf,
        contentType: mime,
      });
      await db
        .update(sceneSnapshots)
        .set({ image_url: publicUrl })
        .where(eq(sceneSnapshots.id, row.id));
      migrated++;
      console.log(`[backfill] ${row.id} ok`);
      await sleep(SLEEP_MS);
    }

    if (DRY_RUN) break;
    if (rows.length < BATCH) break;
  }

  console.log(DRY_RUN ? `[dry-run] rows: ${migrated}` : `Done. Migrated: ${migrated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
