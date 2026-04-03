CREATE TABLE "user_hidden_sessions" (
	"user_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"hidden_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_hidden_sessions_user_id_session_id_pk" PRIMARY KEY("user_id","session_id")
);
--> statement-breakpoint
ALTER TABLE "user_hidden_sessions" ADD CONSTRAINT "user_hidden_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hidden_sessions" ADD CONSTRAINT "user_hidden_sessions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_hidden_sessions_user_id_idx" ON "user_hidden_sessions" USING btree ("user_id");
