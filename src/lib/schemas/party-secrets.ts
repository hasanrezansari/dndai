import { z } from "zod";
import type { output } from "zod";

/** One optional keyword checked case-insensitively in the player's line text. */
export const PartySecretObjectiveSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(500),
  keyword: z.string().min(1).max(64).nullable().optional(),
  completed: z.boolean().optional(),
});

export const PartySecretAssignmentSchema = z.object({
  role_key: z.string().min(1).max(64),
  role_label: z.string().min(1).max(120),
  objectives: z.array(PartySecretObjectiveSchema).max(8),
});

export const PartySecretsV1Schema = z.object({
  version: z.literal(1),
  assignments: z.record(z.string().uuid(), PartySecretAssignmentSchema),
  secret_bp_totals: z.record(z.string().uuid(), z.number()).optional(),
});

export type PartySecretsV1 = output<typeof PartySecretsV1Schema>;

export type PartySecretRoleTemplate = {
  roleKey: string;
  label: string;
  objectives: Array<{ id: string; text: string; keyword: string | null }>;
};
