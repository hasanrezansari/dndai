import { z } from "zod";
import type { output } from "zod";

import { DiceTypeSchema, RollResultSchema } from "./enums";
import { StatePatchSchema } from "./state-patches";

export const PlayerJoinedEventSchema = z.object({
  player_id: z.string().uuid(),
  name: z.string(),
  character_class: z.string(),
});
export type PlayerJoinedEvent = output<typeof PlayerJoinedEventSchema>;

export const PlayerReadyEventSchema = z.object({
  player_id: z.string().uuid(),
  is_ready: z.boolean(),
});
export type PlayerReadyEvent = output<typeof PlayerReadyEventSchema>;

export const PlayerDisconnectedEventSchema = z.object({
  player_id: z.string().uuid(),
});
export type PlayerDisconnectedEvent = output<typeof PlayerDisconnectedEventSchema>;

export const SessionCapUpdatedEventSchema = z.object({
  max_players: z.number().int().min(1).max(6),
});
export type SessionCapUpdatedEvent = output<typeof SessionCapUpdatedEventSchema>;

/** Lobby host updated premise fields; clients refetch session. Payload may grow later. */
export const SessionPremiseUpdatedEventSchema = z.object({});
export type SessionPremiseUpdatedEvent = output<
  typeof SessionPremiseUpdatedEventSchema
>;

export const SessionStartedEventSchema = z.object({
  campaign_title: z.string(),
  opening_scene: z.string(),
  /** When `party`, clients should open the session play surface instead of character create. */
  game_kind: z.enum(["campaign", "party"]).optional(),
  /** Solo PlayRomana quick play: pregen hero exists — open session, not character builder. */
  quick_play: z.boolean().optional(),
});
export type SessionStartedEvent = output<typeof SessionStartedEventSchema>;

export const PartyStateUpdatedEventSchema = z.object({
  state_version: z.number().int().min(0),
});
export type PartyStateUpdatedEvent = output<typeof PartyStateUpdatedEventSchema>;

export const TurnStartedEventSchema = z.object({
  turn_id: z.string().uuid(),
  player_id: z.string().uuid(),
  round_number: z.number().int().min(1),
});
export type TurnStartedEvent = output<typeof TurnStartedEventSchema>;

export const ActionSubmittedEventSchema = z.object({
  player_id: z.string().uuid(),
  raw_input: z.string(),
  turn_id: z.string().uuid().optional(),
  round_number: z.number().int().min(1).optional(),
});
export type ActionSubmittedEvent = output<typeof ActionSubmittedEventSchema>;

export const DiceRollingEventSchema = z.object({
  roll_context: z.string(),
  dice_type: DiceTypeSchema,
  turn_id: z.string().uuid().optional(),
  round_number: z.number().int().min(1).optional(),
});
export type DiceRollingEvent = output<typeof DiceRollingEventSchema>;

export const DiceResultEventSchema = z.object({
  dice_type: DiceTypeSchema,
  roll_value: z.number().int(),
  modifier: z.number().int(),
  total: z.number().int(),
  result: RollResultSchema,
  context: z.string().optional(),
  turn_id: z.string().uuid().optional(),
  round_number: z.number().int().min(1).optional(),
});
export type DiceResultEvent = output<typeof DiceResultEventSchema>;

export const NarrationNextActorSchema = z.object({
  player_id: z.string().uuid(),
});

export const NarrationUpdateEventSchema = z.object({
  scene_text: z.string(),
  visible_changes: z.array(z.string()),
  next_actor: NarrationNextActorSchema,
  event_type: z.enum(["narration", "dm_event"]).optional(),
  turn_id: z.string().uuid().optional(),
  round_number: z.number().int().min(1).optional(),
});
export type NarrationUpdateEvent = output<typeof NarrationUpdateEventSchema>;

export const AwaitingDmEventSchema = z.object({
  turn_id: z.string().uuid(),
  acting_player_id: z.string().uuid(),
  betrayal_briefing: z
    .object({
      spine: z.string(),
      prompts: z.array(z.string()),
    })
    .optional(),
});
export type AwaitingDmEvent = output<typeof AwaitingDmEventSchema>;

export const DmNoticeEventSchema = z.object({
  message: z.string(),
  turn_id: z.string().uuid().optional(),
  round_number: z.number().int().min(1).optional(),
});
export type DmNoticeEvent = output<typeof DmNoticeEventSchema>;

export const StateUpdateEventSchema = z.object({
  changes: z.array(StatePatchSchema),
  state_version: z.number().int().min(0),
  dismiss_scene_pending: z.boolean().optional(),
  turn_id: z.string().uuid().optional(),
  round_number: z.number().int().min(1).optional(),
});
export type StateUpdateEvent = output<typeof StateUpdateEventSchema>;

export const SceneImagePendingEventSchema = z.object({
  scene_id: z.string().uuid(),
  label: z.string(),
  turn_id: z.string().uuid().optional(),
  round_number: z.number().int().min(1).optional(),
});
export type SceneImagePendingEvent = output<typeof SceneImagePendingEventSchema>;

export const SceneImageReadyEventSchema = z.object({
  scene_id: z.string().uuid(),
  image_url: z.string(),
});
export type SceneImageReadyEvent = output<typeof SceneImageReadyEventSchema>;

export const SceneImageFailedEventSchema = z.object({
  scene_id: z.string().uuid(),
});
export type SceneImageFailedEvent = output<typeof SceneImageFailedEventSchema>;

export const StatChangeEffectSchema = z.object({
  target_type: z.enum(["player", "npc"]),
  target_id: z.string(),
  target_name: z.string().optional(),
  hp_delta: z.number().int().default(0),
  mana_delta: z.number().int().default(0),
  conditions_add: z.array(z.string()).default([]),
  conditions_remove: z.array(z.string()).default([]),
  reasoning: z.string().default(""),
});

export const StatChangeEventSchema = z.object({
  effects: z.array(StatChangeEffectSchema),
  turn_id: z.string().uuid().optional(),
  round_number: z.number().int().min(1).optional(),
});
export type StatChangeEvent = output<typeof StatChangeEventSchema>;

export const RoundSummaryEventSchema = z.object({
  summary_text: z.string(),
  round_number: z.number().int().min(1),
  turn_id: z.string().uuid().optional(),
});
export type RoundSummaryEvent = output<typeof RoundSummaryEventSchema>;

export const PvpDefenseChallengeEventSchema = z.object({
  turn_id: z.string().uuid(),
  attacker_player_id: z.string().uuid(),
  defender_player_id: z.string().uuid(),
  round_number: z.number().int().min(1),
});
export type PvpDefenseChallengeEvent = output<typeof PvpDefenseChallengeEventSchema>;
