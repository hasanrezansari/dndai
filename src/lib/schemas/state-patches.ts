import { z } from "zod";
import type { output } from "zod";

import { GamePhaseSchema } from "./enums";

export const ItemRefSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});
export type ItemRef = output<typeof ItemRefSchema>;

export const NpcHpPatchSchema = z.object({
  op: z.literal("npc_hp"),
  npcId: z.string(),
  delta: z.number(),
  reason: z.string(),
});

export const NpcRevealPatchSchema = z.object({
  op: z.literal("npc_reveal"),
  npcId: z.string(),
  level: z.enum(["none", "partial", "full"]),
});

export const PlayerHpPatchSchema = z.object({
  op: z.literal("player_hp"),
  playerId: z.string(),
  delta: z.number(),
});

export const PlayerManaPatchSchema = z.object({
  op: z.literal("player_mana"),
  playerId: z.string(),
  delta: z.number(),
});

export const ConditionAddPatchSchema = z.object({
  op: z.literal("condition_add"),
  targetId: z.string(),
  condition: z.string(),
});

export const ConditionRemovePatchSchema = z.object({
  op: z.literal("condition_remove"),
  targetId: z.string(),
  condition: z.string(),
});

export const InventoryAddPatchSchema = z.object({
  op: z.literal("inventory_add"),
  playerId: z.string(),
  item: ItemRefSchema,
});

export const InventoryRemovePatchSchema = z.object({
  op: z.literal("inventory_remove"),
  playerId: z.string(),
  itemId: z.string(),
});

export const PhaseSetPatchSchema = z.object({
  op: z.literal("phase_set"),
  phase: GamePhaseSchema,
});

export const LocationSetPatchSchema = z.object({
  op: z.literal("location_set"),
  summary: z.string(),
  tags: z.array(z.string()),
});

export const StatePatchSchema = z.discriminatedUnion("op", [
  NpcHpPatchSchema,
  NpcRevealPatchSchema,
  PlayerHpPatchSchema,
  PlayerManaPatchSchema,
  ConditionAddPatchSchema,
  ConditionRemovePatchSchema,
  InventoryAddPatchSchema,
  InventoryRemovePatchSchema,
  PhaseSetPatchSchema,
  LocationSetPatchSchema,
]);

export type StatePatch = output<typeof StatePatchSchema>;
