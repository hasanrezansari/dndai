-- Server-only JSON for party secret roles (never mixed into TV-safe party_config before game end).
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "party_secrets" jsonb;
