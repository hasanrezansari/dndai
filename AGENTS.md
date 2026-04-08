<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Infra / Postgres egress

- Do not add `data:` / base64 image payloads to hot tables. Scene art: R2 when `R2_*` env is set (`src/lib/storage/scene-image-storage.ts`); hydrates use `sceneSnapshotFeedColumns` (no `image_url` on bulk `scene_snapshots` reads).
