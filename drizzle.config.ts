import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Supabase/Postgres: use direct (session) URL for migrations; pooler breaks some DDL.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
});
