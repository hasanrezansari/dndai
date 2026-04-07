import { z } from "zod";
import type { output } from "zod";

export const SessionModeSchema = z.enum(["ai_dm", "human_dm"]);
export type SessionMode = output<typeof SessionModeSchema>;

/** Parallel to `sessions.mode` (ai/human DM). Party = Jackbox-style rooms; campaign = default RPG loop. */
export const GameKindSchema = z.enum(["campaign", "party"]);
export type GameKind = output<typeof GameKindSchema>;

export const CampaignModeSchema = z.enum(["user_prompt", "random", "module"]);
export type CampaignMode = output<typeof CampaignModeSchema>;

export const SessionStatusSchema = z.enum(["lobby", "active", "paused", "ended"]);
export type SessionStatus = output<typeof SessionStatusSchema>;

export const GamePhaseSchema = z.enum(["exploration", "combat", "social", "rest"]);
export type GamePhase = output<typeof GamePhaseSchema>;

export const TurnStatusSchema = z.enum([
  "awaiting_input",
  "processing",
  "awaiting_dm",
  "awaiting_pvp_defense",
  "resolved",
]);
export type TurnStatus = output<typeof TurnStatusSchema>;

export const ResolutionStatusSchema = z.enum(["pending", "applied", "failed"]);
export type ResolutionStatus = output<typeof ResolutionStatusSchema>;

export const DiceTypeSchema = z.enum(["d4", "d6", "d8", "d10", "d12", "d20"]);
export type DiceType = output<typeof DiceTypeSchema>;

export const AdvantageStateSchema = z.enum(["none", "advantage", "disadvantage"]);
export type AdvantageState = output<typeof AdvantageStateSchema>;

export const RollResultSchema = z.enum([
  "success",
  "failure",
  "critical_success",
  "critical_failure",
]);
export type RollResult = output<typeof RollResultSchema>;

export const ImageStatusSchema = z.enum([
  "none",
  "pending",
  "generating",
  "ready",
  "failed",
]);
export type ImageStatus = output<typeof ImageStatusSchema>;

export const ImageJobStatusSchema = z.enum(["queued", "processing", "ready", "failed"]);
export type ImageJobStatus = output<typeof ImageJobStatusSchema>;

export const NPCStatusSchema = z.enum(["alive", "dead", "fled", "hidden"]);
export type NPCStatus = output<typeof NPCStatusSchema>;

export const SummaryTypeSchema = z.enum(["rolling", "milestone"]);
export type SummaryType = output<typeof SummaryTypeSchema>;
