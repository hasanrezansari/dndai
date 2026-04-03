import { z } from "zod";
import type { output } from "zod";

import { AdvantageStateSchema, DiceTypeSchema, SummaryTypeSchema } from "./enums";

export const ActionIntentTargetSchema = z.object({
  kind: z.enum(["npc", "player", "environment"]),
  id: z.string().optional(),
  label: z.string().optional(),
});

export const ActionIntentSchema = z.object({
  action_type: z.enum([
    "attack",
    "cast_spell",
    "move",
    "talk",
    "inspect",
    "use_item",
    "defend",
    "heal",
    "other",
  ]),
  targets: z.array(ActionIntentTargetSchema).default([]),
  skill_or_save: z
    .enum(["str", "dex", "con", "int", "wis", "cha", "none"])
    .default("none"),
  requires_roll: z.boolean(),
  suggested_roll_context: z.string().optional(),
  confidence: z.number().min(0).max(1),
  /** LLMs may return null; normalize to undefined in app code. */
  rephrase_reason: z.string().nullish(),
});
export type ActionIntent = output<typeof ActionIntentSchema>;

export const RulesRollSpecSchema = z.object({
  dice: DiceTypeSchema,
  modifier: z.number(),
  advantage_state: AdvantageStateSchema,
  context: z.string(),
  dc: z.number().optional(),
});

export const RulesInterpreterOutputSchema = z.object({
  legal: z.boolean(),
  denial_reason: z.string().optional(),
  rolls: z.array(RulesRollSpecSchema),
  auto_success: z.boolean().optional(),
});
export type RulesInterpreterOutput = output<typeof RulesInterpreterOutputSchema>;

export const NarratorImageHintSchema = z.object({
  subjects: z.array(z.string()).default([]),
  environment: z.string().optional(),
  mood: z.string().optional(),
  avoid: z.array(z.string()).default([]),
});

export const NarratorOutputSchema = z.object({
  scene_text: z.string().min(20).max(4000),
  visible_changes: z.array(z.string()).default([]),
  tone: z.string().default("neutral"),
  next_actor_id: z.string().nullable().default(null),
  image_hint: NarratorImageHintSchema.default({ subjects: [], avoid: [] }),
});
export type NarratorOutput = output<typeof NarratorOutputSchema>;

export const VisualDeltaOutputSchema = z.object({
  image_needed: z.boolean(),
  reasons: z.array(z.string()),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});
export type VisualDeltaOutput = output<typeof VisualDeltaOutputSchema>;

export const QuestSignalOutputSchema = z.object({
  signal_text: z.string().min(12).max(140),
  focus_term: z.string().min(2).max(40),
  suggested_sub_objective: z.string().min(6).max(80).optional(),
  confidence: z.number().min(0).max(1).default(0.65),
});
export type QuestSignalOutput = output<typeof QuestSignalOutputSchema>;

export const CampaignSeedNpcSchema = z.object({
  name: z.string(),
  role: z.string(),
  attitude: z.string(),
  hook: z.string().optional(),
  visual_profile: z.record(z.string(), z.unknown()).optional(),
});

export const CampaignSeedFirstSceneSchema = z.object({
  title: z.string(),
  description: z.string(),
  sensory_tags: z.array(z.string()).default([]),
});

export const CampaignSeedOutputSchema = z.object({
  campaign_title: z.string(),
  world_summary: z.string(),
  opening_mission: z.string(),
  objective: z.string(),
  first_scene: CampaignSeedFirstSceneSchema,
  initial_npcs: z.array(CampaignSeedNpcSchema),
  initial_threat: z.string().optional(),
  tone: z.string(),
  style_policy: z.string(),
  visual_bible_seed: z.record(z.string(), z.unknown()),
});
export type CampaignSeedOutput = output<typeof CampaignSeedOutputSchema>;

export const ConsequenceEffectSchema = z.object({
  target_type: z.enum(["player", "npc"]).default("player"),
  target_id: z.string(),
  hp_delta: z.number().int().min(-30).max(30).default(0),
  mana_delta: z.number().int().min(-20).max(20).default(0),
  conditions_add: z.array(z.string()).default([]),
  conditions_remove: z.array(z.string()).default([]),
  reasoning: z.string().max(120).default(""),
});
export type ConsequenceEffect = output<typeof ConsequenceEffectSchema>;

export const ConsequenceOutputSchema = z.object({
  effects: z.array(ConsequenceEffectSchema).default([]),
  phase_change: z.enum(["exploration", "combat", "social", "rest"]).nullable().default(null),
  narrative_hint: z.string().max(200).default(""),
});
export type ConsequenceOutput = output<typeof ConsequenceOutputSchema>;

export const ImagePromptOutputSchema = z.object({
  prompt: z.string(),
  style_key: z.string(),
  composition_hint: z.string(),
});
export type ImagePromptOutput = output<typeof ImagePromptOutputSchema>;

export const ImagePromptComposerOutputSchema = z.object({
  image_generation_prompt: z.string().min(10).max(2000),
});
export type ImagePromptComposerOutput = output<
  typeof ImagePromptComposerOutputSchema
>;

export const MemorySummaryOutputSchema = z.object({
  summary_type: SummaryTypeSchema,
  turn_range_start: z.number().int(),
  turn_range_end: z.number().int(),
  content: z.record(z.string(), z.unknown()),
});
export type MemorySummaryOutput = output<typeof MemorySummaryOutputSchema>;

/** Party mode: combine player lines into one canonical beat (structural, not joke-first). */
export const PartyMergeOutputSchema = z.object({
  merged_beat: z.string().min(20).max(2200),
});
export type PartyMergeOutput = output<typeof PartyMergeOutputSchema>;

/** Party: pick one candidate uuid from the provided list (2p or tie-break). */
export const PartyVoteJudgeOutputSchema = z.object({
  winning_player_id: z.string().uuid(),
});
export type PartyVoteJudgeOutput = output<typeof PartyVoteJudgeOutputSchema>;

/** Party: DM-style establishing beat for the current round (before player lines). */
export const PartyRoundOpenerOutputSchema = z.object({
  scene_beat: z.string().min(40).max(2800),
});
export type PartyRoundOpenerOutput = output<typeof PartyRoundOpenerOutputSchema>;
