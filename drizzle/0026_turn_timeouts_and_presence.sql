ALTER TABLE "players" ADD COLUMN "is_away" boolean DEFAULT false NOT NULL;
ALTER TABLE "players" ADD COLUMN "timeout_streak" integer DEFAULT 0 NOT NULL;
ALTER TABLE "players" ADD COLUMN "last_seen_at" timestamp with time zone;

ALTER TABLE "turns" ADD COLUMN "deadline_at" timestamp with time zone;
ALTER TABLE "turns" ADD COLUMN "warned_at" timestamp with time zone;
ALTER TABLE "turns" ADD COLUMN "auto_resolved" boolean DEFAULT false NOT NULL;
ALTER TABLE "turns" ADD COLUMN "auto_resolve_reason" text;
