import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Supabase/Postgres: use direct (session) URL for migrations; pooler breaks some DDL.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
});
