import { npcStates } from "@/lib/db/schema";

import type { NpcCombatantView } from "@/lib/state/game-store";

type NpcRow = typeof npcStates.$inferSelect;

function readNumericProfile(
  vp: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const k of keys) {
    const x = vp[k];
    if (typeof x === "number" && Number.isFinite(x)) return x;
    if (typeof x === "string" && x.trim() !== "") {
      const n = Number(x);
      if (!Number.isNaN(n) && Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function readAttacksProfile(vp: Record<string, unknown>): string | undefined {
  const a = vp.attacks;
  if (typeof a === "string" && a.trim()) return a.trim();
  if (Array.isArray(a) && a.length > 0)
    return a.map((x) => String(x)).join(", ");
  const w = vp.weapon;
  if (typeof w === "string" && w.trim()) return w.trim();
  return undefined;
}

/**
 * Maps `npc_states` row + optional combat hints in `visual_profile` for the client strip.
 */
export function mapNpcRowToCombatantView(row: NpcRow): NpcCombatantView {
  const raw = row.visual_profile;
  const vp =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const profileAc = readNumericProfile(vp, ["ac", "AC", "armor_class"]);
  const profileHp = readNumericProfile(vp, ["hp", "current_hp", "currentHp", "hit_points"]);
  const profileMaxHp = readNumericProfile(vp, ["max_hp", "maxHp", "max_hit_points"]);
  const attacks = readAttacksProfile(vp);
  const weakRaw = vp.weak_points;
  const weakPoints = Array.isArray(weakRaw)
    ? weakRaw.map((x) => String(x).trim()).filter((x) => x.length > 0)
    : Array.isArray(row.weak_points)
      ? row.weak_points.map((x) => String(x).trim()).filter((x) => x.length > 0)
      : undefined;
  const portraitRaw = vp.portrait_url;
  const portraitUrl =
    typeof portraitRaw === "string" && portraitRaw.trim().length > 0
      ? portraitRaw
      : undefined;
  const portraitStatus = portraitUrl ? "ready" : "locked";

  const revealRaw = String(row.reveal_level ?? "").trim().toLowerCase();
  const revealLevel: "none" | "partial" | "full" =
    revealRaw === "full" || revealRaw === "partial" ? revealRaw : "none";

  return {
    id: row.id,
    name: row.name,
    role: row.role,
    attitude: row.attitude,
    status: row.status,
    location: row.location,
    notes: row.notes,
    revealLevel,
    ac: row.ac ?? profileAc,
    hp: row.hp ?? profileHp,
    maxHp: row.max_hp ?? profileMaxHp,
    weakPoints,
    attacks,
    portraitUrl,
    portraitStatus,
  };
}
