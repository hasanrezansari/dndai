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
    "other",
  ]),
  targets: z.array(ActionIntentTargetSchema).default([]),
  skill_or_save: z
    .enum(["str", "dex", "con", "int", "wis", "cha", "none"])
    .default("none"),
  requires_roll: z.boolean(),
  suggested_roll_context: z.string().optional(),
  confidence: z.number().min(0).max(1),
  rephrase_reason: z.string().optional(),
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
  visible_changes: z.array(z.string()),
  tone: z.string(),
  next_actor_id: z.string().uuid().nullable(),
  image_hint: NarratorImageHintSchema,
});
export type NarratorOutput = output<typeof NarratorOutputSchema>;

export const VisualDeltaOutputSchema = z.object({
  image_needed: z.boolean(),
  reasons: z.array(z.string()),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});
export type VisualDeltaOutput = output<typeof VisualDeltaOutputSchema>;

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
