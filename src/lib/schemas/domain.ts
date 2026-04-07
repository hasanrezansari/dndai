import { z } from "zod";
import type { output } from "zod";

import {
  AdvantageStateSchema,
  CampaignModeSchema,
  DiceTypeSchema,
  GameKindSchema,
  GamePhaseSchema,
  ImageJobStatusSchema,
  ImageStatusSchema,
  NPCStatusSchema,
  ResolutionStatusSchema,
  RollResultSchema,
  SessionModeSchema,
  SessionStatusSchema,
  SummaryTypeSchema,
  TurnStatusSchema,
} from "./enums";

const iso = z.iso.datetime();

export const SessionSchema = z.object({
  id: z.string().uuid(),
  mode: SessionModeSchema,
  campaign_mode: CampaignModeSchema,
  status: SessionStatusSchema,
  max_players: z.number().int().min(1).max(6),
  current_round: z.number().int().min(1).default(1),
  current_turn_index: z.number().int().min(0),
  current_player_id: z.string().uuid().nullable(),
  phase: GamePhaseSchema,
  join_code: z.string(),
  host_user_id: z.string(),
  state_version: z.number().int().min(0),
  adventure_prompt: z.string().nullable(),
  adventure_tags: z.array(z.string()).nullable(),
  art_direction: z.string().nullable(),
  world_bible: z.string().nullable(),
  module_key: z.string().nullable(),
  campaign_title: z.string().nullable(),
  game_kind: GameKindSchema,
  /** Host acquisition funnel; analytics only. */
  acquisition_source: z.string().max(64).nullable().optional(),
  party_config: z.record(z.string(), z.unknown()).nullable().optional(),
  party_secrets: z.record(z.string(), z.unknown()).nullable().optional(),
  visual_rhythm_preset: z.enum(["standard", "cinematic"]).default("standard"),
  chapter_start_round: z.number().int().min(1).default(1),
  chapter_index: z.number().int().min(1).default(1),
  chapter_max_turns: z.number().int().min(1).default(30),
  chapter_system_image_budget: z.number().int().min(0).default(3),
  chapter_system_images_used: z.number().int().min(0).default(0),
  last_manual_scene_image_at: iso.nullable().optional(),
  spark_pool_balance: z.number().int().min(0).default(0),
  chapter_break_offered: z.boolean().default(false),
  /** Betrayal mechanics opt-in; campaign tables only. */
  betrayal_mode: z
    .enum(["off", "story_only", "confrontational"])
    .default("off"),
  created_at: iso,
  updated_at: iso,
});
export type Session = output<typeof SessionSchema>;

export const PlayerSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  user_id: z.string(),
  name: z.string().nullable().optional(),
  character_id: z.string().uuid().nullable(),
  seat_index: z.number().int().min(0).max(5),
  is_ready: z.boolean(),
  is_connected: z.boolean(),
  is_host: z.boolean(),
  is_dm: z.boolean(),
  joined_at: iso,
});
export type Player = output<typeof PlayerSchema>;

export const CharacterStatsSchema = z.object({
  str: z.number().int(),
  dex: z.number().int(),
  con: z.number().int(),
  int: z.number().int(),
  wis: z.number().int(),
  cha: z.number().int(),
});
export type CharacterStats = output<typeof CharacterStatsSchema>;

export const ClassProfileSourceSchema = z.enum(["preset", "custom"]);
export const ClassProfileRoleSchema = z.enum([
  "frontline",
  "skirmisher",
  "arcane",
  "support",
  "guardian",
  "specialist",
]);
export const ClassProfileResourceSchema = z.enum([
  "none",
  "mana",
  "energy",
  "focus",
  "stamina",
]);
export const ClassProfileAbilityTypeSchema = z.enum(["active", "passive"]);
export const ClassProfileEffectKindSchema = z.enum([
  "damage",
  "heal",
  "shield",
  "buff",
  "debuff",
  "mobility",
  "utility",
]);
export const ClassProfileGearTypeSchema = z.enum([
  "weapon",
  "armor",
  "focus",
  "tool",
  "cyberware",
]);

export const ClassProfileStatBiasSchema = z.object({
  str: z.number().int().min(-2).max(3).default(0),
  dex: z.number().int().min(-2).max(3).default(0),
  con: z.number().int().min(-2).max(3).default(0),
  int: z.number().int().min(-2).max(3).default(0),
  wis: z.number().int().min(-2).max(3).default(0),
  cha: z.number().int().min(-2).max(3).default(0),
});

export const ClassProfileAbilitySchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: ClassProfileAbilityTypeSchema,
  effect_kind: ClassProfileEffectKindSchema,
  resource_cost: z.number().int().min(0).max(6).default(0),
  cooldown: z.number().int().min(0).max(6).default(0),
  power_cost: z.number().int().min(1).max(6),
});

export const ClassProfileGearSchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: ClassProfileGearTypeSchema,
  power_cost: z.number().int().min(1).max(4),
});

export const ClassProfileSchema = z
  .object({
    source: ClassProfileSourceSchema,
    display_name: z.string().trim().min(1).max(40),
    concept_prompt: z.string().trim().max(180).default(""),
    fantasy: z.string().trim().max(180).default(""),
    combat_role: ClassProfileRoleSchema,
    resource_model: ClassProfileResourceSchema,
    stat_bias: ClassProfileStatBiasSchema,
    abilities: z.array(ClassProfileAbilitySchema).max(6),
    starting_gear: z.array(ClassProfileGearSchema).max(8),
    visual_tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  })
  .superRefine((value, ctx) => {
    const abilityBudget = value.abilities.reduce((sum, a) => sum + a.power_cost, 0);
    const gearBudget = value.starting_gear.reduce((sum, g) => sum + g.power_cost, 0);
    const statBiasBudget = Object.values(value.stat_bias).reduce(
      (sum, n) => sum + Math.max(0, n),
      0,
    );

    // Guardrails to keep generated/custom kits near preset power.
    if (abilityBudget > 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ability budget exceeded",
        path: ["abilities"],
      });
    }
    if (gearBudget > 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Starting gear budget exceeded",
        path: ["starting_gear"],
      });
    }
    if (statBiasBudget > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stat bias budget exceeded",
        path: ["stat_bias"],
      });
    }
  });
export type ClassProfile = output<typeof ClassProfileSchema>;

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  player_id: z.string().uuid(),
  name: z.string(),
  class: z.string(),
  race: z.string(),
  level: z.number().int().min(1).default(1),
  stats: CharacterStatsSchema,
  hp: z.number().int(),
  max_hp: z.number().int(),
  ac: z.number().int(),
  mana: z.number().int(),
  max_mana: z.number().int(),
  inventory: z.array(z.record(z.string(), z.unknown())),
  abilities: z.array(z.record(z.string(), z.unknown())),
  conditions: z.array(z.string()),
  visual_profile: z.record(z.string(), z.unknown()),
  created_at: iso,
});
export type Character = output<typeof CharacterSchema>;

export const TurnSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  round_number: z.number().int().min(1),
  player_id: z.string().uuid(),
  phase: GamePhaseSchema,
  status: TurnStatusSchema,
  started_at: iso,
  resolved_at: iso.nullable(),
});
export type Turn = output<typeof TurnSchema>;

export const ActionSchema = z.object({
  id: z.string().uuid(),
  turn_id: z.string().uuid(),
  raw_input: z.string(),
  parsed_intent: z.record(z.string(), z.unknown()),
  resolution_status: ResolutionStatusSchema,
  created_at: iso,
});
export type Action = output<typeof ActionSchema>;

export const DiceRollSchema = z.object({
  id: z.string().uuid(),
  action_id: z.string().uuid(),
  roll_type: DiceTypeSchema,
  context: z.string(),
  roll_value: z.number().int(),
  modifier: z.number().int(),
  total: z.number().int(),
  advantage_state: AdvantageStateSchema,
  result: RollResultSchema,
  created_at: iso,
});
export type DiceRoll = output<typeof DiceRollSchema>;

export const SceneSnapshotSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  round_number: z.number().int().min(1),
  state_version: z.number().int().min(0),
  summary: z.string(),
  image_status: ImageStatusSchema,
  image_prompt: z.string().nullable(),
  image_url: z.string().nullable(),
  created_at: iso,
});
export type SceneSnapshot = output<typeof SceneSnapshotSchema>;

export const MemorySummarySchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  summary_type: SummaryTypeSchema,
  content: z.record(z.string(), z.unknown()),
  turn_range_start: z.number().int(),
  turn_range_end: z.number().int(),
  created_at: iso,
});
export type MemorySummary = output<typeof MemorySummarySchema>;

export const NarrativeImageHintSchema = z.object({
  subjects: z.array(z.string()).default([]),
  environment: z.string().optional(),
  mood: z.string().optional(),
  avoid: z.array(z.string()).default([]),
});

export const NarrativeEventSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  turn_id: z.string().uuid().nullable(),
  scene_text: z.string(),
  visible_changes: z.array(z.string()),
  tone: z.string(),
  next_actor_id: z.string().uuid().nullable(),
  image_hint: NarrativeImageHintSchema,
  situation_anchor: z.string().nullable().optional(),
  created_at: iso,
});
export type NarrativeEvent = output<typeof NarrativeEventSchema>;

export const NPCStateSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  name: z.string(),
  role: z.string(),
  attitude: z.string(),
  status: NPCStatusSchema,
  location: z.string(),
  visual_profile: z.record(z.string(), z.unknown()),
  notes: z.string(),
  updated_at: iso,
});
export type NPCState = output<typeof NPCStateSchema>;

export const ImageJobSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  scene_snapshot_id: z.string().uuid().nullable(),
  prompt: z.string(),
  status: ImageJobStatusSchema,
  provider: z.string(),
  image_url: z.string().nullable(),
  cost_cents: z.number().int().nullable(),
  started_at: iso,
  completed_at: iso.nullable(),
});
export type ImageJob = output<typeof ImageJobSchema>;

export const OrchestrationTraceSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  turn_id: z.string().uuid().nullable(),
  step_name: z.string(),
  input_summary: z.record(z.string(), z.unknown()),
  output_summary: z.record(z.string(), z.unknown()),
  model_used: z.string(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  latency_ms: z.number().int(),
  success: z.boolean(),
  error_message: z.string().nullable(),
  created_at: iso,
});
export type OrchestrationTrace = output<typeof OrchestrationTraceSchema>;
