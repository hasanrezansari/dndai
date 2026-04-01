CREATE TABLE "friend_edges" (
	"user_id" text NOT NULL,
	"friend_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_edges_user_id_friend_user_id_pk" PRIMARY KEY("user_id","friend_user_id")
);
--> statement-breakpoint
CREATE TABLE "profile_heroes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"hero_class" text NOT NULL,
	"race" text NOT NULL,
	"stats_template" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"abilities_template" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visual_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"public_profile_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_edges" ADD CONSTRAINT "friend_edges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_edges" ADD CONSTRAINT "friend_edges_friend_user_id_users_id_fk" FOREIGN KEY ("friend_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_heroes" ADD CONSTRAINT "profile_heroes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_settings" ADD CONSTRAINT "user_profile_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_edges_user_idx" ON "friend_edges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "friend_edges_friend_idx" ON "friend_edges" USING btree ("friend_user_id");--> statement-breakpoint
CREATE INDEX "profile_heroes_user_idx" ON "profile_heroes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profile_heroes_public_idx" ON "profile_heroes" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "user_profile_settings_public_idx" ON "user_profile_settings" USING btree ("public_profile_enabled");--> statement-breakpoint