import { db } from "@/lib/db";
import { diceRolls } from "@/lib/db/schema";
import type { DieType } from "@/lib/rules/dice";
import {
  determineResult,
  rollWithAdvantage,
} from "@/lib/rules/dice";
import type { DiceRoll } from "@/lib/schemas/domain";
import type { AdvantageState, DiceType } from "@/lib/schemas/enums";

function mapRow(row: typeof diceRolls.$inferSelect): DiceRoll {
  return {
    id: row.id,
    action_id: row.action_id,
    roll_type: row.roll_type as DiceType,
    context: row.context,
    roll_value: row.roll_value,
    modifier: row.modifier,
    total: row.total,
    advantage_state: row.advantage_state as AdvantageState,
    result: row.result as DiceRoll["result"],
    created_at: row.created_at.toISOString(),
  };
}

export async function performRoll(params: {
  actionId: string;
  diceType: DieType;
  context: string;
  modifier: number;
  advantageState: "none" | "advantage" | "disadvantage";
  dc?: number;
}): Promise<DiceRoll> {
  const dc = params.dc ?? 10;
  const { value } = rollWithAdvantage(
    params.diceType,
    params.advantageState,
  );
  const rawRoll = value;
  const total = rawRoll + params.modifier;
  const result = determineResult(
    total,
    dc,
    rawRoll,
    params.diceType,
  );

  const [row] = await db
    .insert(diceRolls)
    .values({
      action_id: params.actionId,
      roll_type: params.diceType,
      context: params.context,
      roll_value: rawRoll,
      modifier: params.modifier,
      total,
      advantage_state: params.advantageState,
      result,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to persist dice roll");
  }

  return mapRow(row);
}
