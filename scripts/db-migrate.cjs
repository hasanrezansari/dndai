/**
 * Applies SQL migrations in drizzle/ using drizzle-orm's migrator.
 * Prefer this over `drizzle-kit migrate` when the CLI spinner hangs (e.g. some Railway / non-TTY setups).
 */
const path = require("path");
const { loadEnvConfig } = require("@next/env");
const { drizzle } = require("drizzle-orm/node-postgres");
const { migrate } = require("drizzle-orm/node-postgres/migrator");
const pg = require("pg");

loadEnvConfig(path.join(__dirname, ".."));
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DIRECT_URL or DATABASE_URL.");
  process.exit(1);
}

async function main() {
  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 20_000,
  });
  const db = drizzle(pool);
  try {
    await migrate(db, {
      migrationsFolder: path.join(__dirname, "..", "drizzle"),
    });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
