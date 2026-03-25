import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { characters, players, sessions } from "@/lib/db/schema";
import { StatePatchSchema } from "@/lib/schemas/state-patches";
import type { StatePatch } from "@/lib/schemas/state-patches";

export async function commitStatePatches(
  sessionId: string,
  patches: StatePatch[],
): Promise<{ stateVersion: number }> {
  if (patches.length === 0) {
    const [row] = await db
      .select({ state_version: sessions.state_version })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    return { stateVersion: row?.state_version ?? 0 };
  }

  const validated: StatePatch[] = [];
  for (const p of patches) {
    const r = StatePatchSchema.safeParse(p);
    if (!r.success) {
      throw new Error("Invalid state patch");
    }
    validated.push(r.data);
  }

  const [sess] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sess) {
    throw new Error("Session not found");
  }

  for (const patch of validated) {
    if (patch.op === "player_hp") {
      const rows = await db
        .select({ character: characters })
        .from(characters)
        .innerJoin(players, eq(characters.player_id, players.id))
        .where(
          and(
            eq(players.session_id, sessionId),
            eq(players.id, patch.playerId),
          ),
        )
        .limit(1);
      const char = rows[0]?.character;
      if (char) {
        const hp = Math.min(
          char.max_hp,
          Math.max(0, char.hp + patch.delta),
        );
        const conditions = Array.isArray(char.conditions) ? [...char.conditions] : [];
        if (hp <= 0 && !conditions.includes("unconscious")) {
          conditions.push("unconscious");
        }
        if (hp > 0) {
          const idx = conditions.indexOf("unconscious");
          if (idx !== -1) conditions.splice(idx, 1);
        }
        await db
          .update(characters)
          .set({ hp, conditions })
          .where(eq(characters.id, char.id));
      }
    } else if (patch.op === "condition_add") {
      const rows = await db
        .select({ character: characters })
        .from(characters)
        .innerJoin(players, eq(characters.player_id, players.id))
        .where(
          and(
            eq(players.session_id, sessionId),
            eq(players.id, patch.targetId),
          ),
        )
        .limit(1);
      const char = rows[0]?.character;
      if (char) {
        const current = Array.isArray(char.conditions) ? char.conditions : [];
        if (!current.includes(patch.condition)) {
          await db
            .update(characters)
            .set({ conditions: [...current, patch.condition] })
            .where(eq(characters.id, char.id));
        }
      }
    } else if (patch.op === "condition_remove") {
      const rows = await db
        .select({ character: characters })
        .from(characters)
        .innerJoin(players, eq(characters.player_id, players.id))
        .where(
          and(
            eq(players.session_id, sessionId),
            eq(players.id, patch.targetId),
          ),
        )
        .limit(1);
      const char = rows[0]?.character;
      if (char) {
        const current = Array.isArray(char.conditions) ? char.conditions : [];
        await db
          .update(characters)
          .set({ conditions: current.filter((c) => c !== patch.condition) })
          .where(eq(characters.id, char.id));
      }
    } else if (patch.op === "phase_set") {
      await db
        .update(sessions)
        .set({
          phase: patch.phase,
          updated_at: new Date(),
        })
        .where(eq(sessions.id, sessionId));
    }
  }

  await db
    .update(sessions)
    .set({
      state_version: sess.state_version + 1,
      updated_at: new Date(),
    })
    .where(eq(sessions.id, sessionId));

  const [after] = await db
    .select({ state_version: sessions.state_version })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  return { stateVersion: after?.state_version ?? 0 };
}
