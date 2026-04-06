CREATE TABLE "spark_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" text,
	"session_id" uuid,
	"external_payment_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_wallets" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spark_transactions" ADD CONSTRAINT "spark_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spark_transactions" ADD CONSTRAINT "spark_transactions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spark_transactions_user_created_idx" ON "spark_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "spark_transactions_session_idx" ON "spark_transactions" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spark_transactions_user_idempotency_uidx" ON "spark_transactions" USING btree ("user_id","idempotency_key") WHERE "spark_transactions"."idempotency_key" IS NOT NULL;