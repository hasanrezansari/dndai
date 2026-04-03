-- Optional analytics: where the host created the session (e.g. play_romana_party_home).
-- Does not affect campaign gameplay, turns, or quests.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "acquisition_source" text;
