/**
 * Destructive: drops `public` (all app tables) and `drizzle` (Drizzle migration journal),
 * then recreates `public`. If we only dropped `public`, a failed migrate could leave
 * rows in `drizzle.__drizzle_migrations` while DDL rolled back — next migrate would skip
 * early migrations and break.
 * Supabase: keeps `auth`, `storage`, etc. Use DIRECT_URL (session) not the pooler.
 *
 * Run: RESET_DATABASE=1 npm run db:reset
 */

const { Client } = require("pg");
const { loadEnvConfig } = require("@next/env");
const { spawnSync } = require("node:child_process");

loadEnvConfig(process.cwd());

if (process.env.RESET_DATABASE !== "1") {
  console.error(
    "Refusing to wipe the database. Set RESET_DATABASE=1 (e.g. RESET_DATABASE=1 pnpm db:reset).",
  );
  process.exit(1);
}

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DIRECT_URL or DATABASE_URL.");
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    console.log("Dropping schemas drizzle + public (full reset)…");
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE;");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE;");
    await client.query("CREATE SCHEMA public;");
    // Supabase API roles (safe if role names differ on vanilla Postgres)
    await client.query(
      "GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;",
    );
    for (const role of ["anon", "authenticated", "service_role"]) {
      try {
        await client.query(`GRANT USAGE ON SCHEMA public TO "${role}";`);
      } catch {
        /* vanilla Postgres or role missing */
      }
    }
    console.log("Schema public recreated.");
  } finally {
    await client.end();
  }

  console.log("Running drizzle-kit migrate…");
  const r = spawnSync("npx", ["drizzle-kit", "migrate"], {
    stdio: "inherit",
    cwd: require("node:path").join(__dirname, ".."),
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
