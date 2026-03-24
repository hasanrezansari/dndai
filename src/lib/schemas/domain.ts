import { z } from "zod";
import type { output } from "zod";

import {
  AdvantageStateSchema,
  CampaignModeSchema,
  DiceTypeSchema,
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
  max_players: z.number().int().min(2).max(6),
  current_round: z.number().int().min(1).default(1),
  current_turn_index: z.number().int().min(0),
  current_player_id: z.string().uuid().nullable(),
  phase: GamePhaseSchema,
  join_code: z.string(),
  host_user_id: z.string(),
  state_version: z.number().int().min(0),
  adventure_prompt: z.string().nullable(),
  module_key: z.string().nullable(),
  campaign_title: z.string().nullable(),
  created_at: iso,
  updated_at: iso,
});
export type Session = output<typeof SessionSchema>;

export const PlayerSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  user_id: z.string(),
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
