import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const authUsers = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const userProfileSettings = pgTable(
  "user_profile_settings",
  {
    user_id: text("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    public_profile_enabled: boolean("public_profile_enabled")
      .notNull()
      .default(false),
    free_portrait_uses: integer("free_portrait_uses").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("user_profile_settings_public_idx").on(t.public_profile_enabled)],
);

export const profileHeroes = pgTable(
  "profile_heroes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hero_class: text("hero_class").notNull(),
    race: text("race").notNull(),
    stats_template: jsonb("stats_template")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    abilities_template: jsonb("abilities_template")
      .$type<unknown[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    visual_profile: jsonb("visual_profile")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    is_public: boolean("is_public").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("profile_heroes_user_idx").on(t.user_id),
    index("profile_heroes_public_idx").on(t.is_public),
  ],
);

export const friendEdges = pgTable(
  "friend_edges",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    friend_user_id: text("friend_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.friend_user_id] }),
    userIdx: index("friend_edges_user_idx").on(t.user_id),
    friendIdx: index("friend_edges_friend_idx").on(t.friend_user_id),
  }),
);

export const friendRequests = pgTable(
  "friend_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    from_user_id: text("from_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    to_user_id: text("to_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    responded_at: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    index("friend_requests_to_status_created_idx").on(
      t.to_user_id,
      t.status,
      t.created_at,
    ),
    index("friend_requests_from_status_created_idx").on(
      t.from_user_id,
      t.status,
      t.created_at,
    ),
  ],
);

export const authAccounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
);

export const authSessions = pgTable("auth_sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const authVerificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

export const authBridgeTokens = pgTable(
  "auth_bridge_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token_hash: text("token_hash").notNull().unique(),
    user_id: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    used_at: timestamp("used_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("auth_bridge_tokens_user_id_idx").on(t.user_id)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mode: text("mode").notNull(),
    campaign_mode: text("campaign_mode").notNull(),
    status: text("status").notNull().default("lobby"),
    max_players: integer("max_players").notNull(),
    current_round: integer("current_round").notNull().default(1),
    current_turn_index: integer("current_turn_index").notNull().default(0),
    current_player_id: uuid("current_player_id"),
    phase: text("phase").notNull().default("exploration"),
    join_code: text("join_code").notNull().unique(),
    host_user_id: text("host_user_id").notNull(),
    state_version: integer("state_version").notNull().default(0),
    adventure_prompt: text("adventure_prompt"),
    /** Optional lobby chips / tone hints for seeding and AI context (string array JSON). */
    adventure_tags: jsonb("adventure_tags").$type<string[]>(),
    /** Free-text art direction for image models (style, medium, palette). */
    art_direction: text("art_direction"),
    /** Long-form premise / world bible pasted by the host; fed to seeder and memory. */
    world_bible: text("world_bible"),
    module_key: text("module_key"),
    campaign_title: text("campaign_title"),
    world_summary: text("world_summary"),
    style_policy: text("style_policy"),
    tone: text("tone"),
    visual_bible_seed: jsonb("visual_bible_seed")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`),
    /** `campaign` = default RPG loop; `party` = Jackbox-style (separate APIs / phase machine). */
    game_kind: text("game_kind").notNull().default("campaign"),
    /** Versioned party state; null when `game_kind` is campaign. */
    party_config: jsonb("party_config").$type<Record<string, unknown>>(),
    /**
     * Party secret roles + objective progress; server-only until game end summary.
     * Not used when `game_kind` is campaign.
     */
    party_secrets: jsonb("party_secrets").$type<Record<string, unknown>>(),
    /** Optional create funnel label for analytics (never drives gameplay). */
    acquisition_source: text("acquisition_source"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sessions_host_user_id_idx").on(t.host_user_id),
  ],
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    user_id: text("user_id").notNull(),
    character_id: uuid("character_id"),
    seat_index: integer("seat_index").notNull(),
    is_ready: boolean("is_ready").notNull().default(false),
    is_connected: boolean("is_connected").notNull().default(true),
    is_host: boolean("is_host").notNull().default(false),
    is_dm: boolean("is_dm").notNull().default(false),
    joined_at: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("players_session_id_idx").on(t.session_id)],
);

export const characters = pgTable("characters", {
  id: uuid("id").defaultRandom().primaryKey(),
  player_id: uuid("player_id")
    .notNull()
    .references(() => players.id)
    .unique(),
  name: text("name").notNull(),
  class: text("class").notNull(),
  race: text("race").notNull(),
  level: integer("level").notNull().default(1),
  stats: jsonb("stats")
    .$type<Record<string, unknown>>()
    .notNull(),
  hp: integer("hp").notNull(),
  max_hp: integer("max_hp").notNull(),
  ac: integer("ac").notNull(),
  mana: integer("mana").notNull(),
  max_mana: integer("max_mana").notNull(),
  inventory: jsonb("inventory")
    .$type<unknown[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  abilities: jsonb("abilities")
    .$type<unknown[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  conditions: jsonb("conditions")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  visual_profile: jsonb("visual_profile")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const turns = pgTable(
  "turns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    round_number: integer("round_number").notNull(),
    player_id: uuid("player_id")
      .notNull()
      .references(() => players.id),
    phase: text("phase").notNull(),
    status: text("status").notNull().default("awaiting_input"),
    started_at: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("turns_session_round_started_idx").on(
      t.session_id,
      t.round_number,
      t.started_at,
    ),
  ],
);

export const actions = pgTable(
  "actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    turn_id: uuid("turn_id")
      .notNull()
      .references(() => turns.id),
    raw_input: text("raw_input").notNull(),
    parsed_intent: jsonb("parsed_intent")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    resolution_status: text("resolution_status").notNull().default("pending"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("actions_turn_created_idx").on(t.turn_id, t.created_at)],
);

export const diceRolls = pgTable(
  "dice_rolls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    action_id: uuid("action_id")
      .notNull()
      .references(() => actions.id),
    roll_type: text("roll_type").notNull(),
    context: text("context").notNull(),
    roll_value: integer("roll_value").notNull(),
    modifier: integer("modifier").notNull(),
    total: integer("total").notNull(),
    advantage_state: text("advantage_state").notNull().default("none"),
    result: text("result").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("dice_rolls_action_id_idx").on(t.action_id)],
);

export const sceneSnapshots = pgTable(
  "scene_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    round_number: integer("round_number").notNull(),
    state_version: integer("state_version").notNull(),
    summary: text("summary").notNull(),
    image_status: text("image_status").notNull().default("none"),
    image_prompt: text("image_prompt"),
    image_url: text("image_url"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("scene_snapshots_session_id_idx").on(t.session_id)],
);

export const memorySummaries = pgTable(
  "memory_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    summary_type: text("summary_type").notNull(),
    content: jsonb("content")
      .$type<Record<string, unknown>>()
      .notNull(),
    turn_range_start: integer("turn_range_start").notNull(),
    turn_range_end: integer("turn_range_end").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("memory_summaries_session_id_idx").on(t.session_id)],
);

export const narrativeEvents = pgTable(
  "narrative_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    turn_id: uuid("turn_id").references(() => turns.id),
    scene_text: text("scene_text").notNull(),
    visible_changes: jsonb("visible_changes")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    tone: text("tone").notNull(),
    next_actor_id: uuid("next_actor_id"),
    image_hint: jsonb("image_hint")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("narrative_events_session_created_idx").on(
      t.session_id,
      t.created_at.desc(),
    ),
  ],
);

export const npcStates = pgTable(
  "npc_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    name: text("name").notNull(),
    role: text("role").notNull(),
    attitude: text("attitude").notNull(),
    status: text("status").notNull().default("alive"),
    location: text("location").notNull(),
    hp: integer("hp").notNull().default(10),
    max_hp: integer("max_hp").notNull().default(10),
    ac: integer("ac").notNull().default(10),
    weak_points: jsonb("weak_points")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    reveal_level: text("reveal_level").notNull().default("none"),
    visual_profile: jsonb("visual_profile")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    notes: text("notes").notNull().default(""),
    introduced_turn_id: uuid("introduced_turn_id").references(() => turns.id),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("npc_states_session_id_idx").on(t.session_id)],
);

export const imageJobs = pgTable(
  "image_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    scene_snapshot_id: uuid("scene_snapshot_id").references(
      () => sceneSnapshots.id,
    ),
    prompt: text("prompt").notNull(),
    status: text("status").notNull().default("queued"),
    provider: text("provider").notNull().default("fal"),
    image_url: text("image_url"),
    cost_cents: integer("cost_cents"),
    started_at: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("image_jobs_session_status_created_idx").on(
      t.session_id,
      t.status,
      t.started_at,
    ),
  ],
);

export const orchestrationTraces = pgTable(
  "orchestration_traces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    turn_id: uuid("turn_id").references(() => turns.id),
    step_name: text("step_name").notNull(),
    input_summary: jsonb("input_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    output_summary: jsonb("output_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    model_used: text("model_used").notNull(),
    tokens_in: integer("tokens_in").notNull(),
    tokens_out: integer("tokens_out").notNull(),
    latency_ms: integer("latency_ms").notNull(),
    success: boolean("success").notNull(),
    error_message: text("error_message"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("orchestration_traces_session_created_idx").on(
      t.session_id,
      t.created_at.desc(),
    ),
  ],
);
