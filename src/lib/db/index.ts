import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/** Tuned for serverless (Vercel + Supabase): many instances × low max avoids exhausting DB connections. */
const DEFAULT_POOL_MAX = 3;

let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is required");
    }
    const maxRaw = process.env.DATABASE_POOL_MAX;
    const max = maxRaw !== undefined ? Number(maxRaw) : DEFAULT_POOL_MAX;
    _pool = new Pool({
      connectionString: url,
      max: Number.isFinite(max) && max > 0 ? max : DEFAULT_POOL_MAX,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return _pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type Database = NodePgDatabase<typeof schema>;
