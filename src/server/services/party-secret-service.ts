import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { players, sessions } from "@/lib/db/schema";
import { seededShuffle } from "@/lib/party/party-slot-utils";
import { getPartySecretTemplatePack } from "@/lib/party/party-templates";
import {
  partyConfigForSessionPayload,
  type PartyConfigClientView,
  PartyConfigV1Schema,
} from "@/lib/schemas/party";
import {
  PartySecretsV1Schema,
  type PartySecretsV1,
} from "@/lib/schemas/party-secrets";
import { broadcastPartyStateRefresh } from "@/lib/party/party-socket";

async function listPartyParticipantPlayerIdsLocal(
  sessionId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: players.id, is_dm: players.is_dm })
    .from(players)
    .where(eq(players.session_id, sessionId))
    .orderBy(asc(players.seat_index));
  const nonDm = rows.filter((r) => !r.is_dm).map((r) => r.id);
  return nonDm.length > 0 ? nonDm : rows.map((r) => r.id);
}

function lineMatchesKeyword(line: string, keyword: string): boolean {
  const low = line.toLowerCase();
  const k = keyword.toLowerCase().trim();
  if (!k) return false;
  if (low.includes(k)) return true;
  if (k === "rumor" && low.includes("rumour")) return true;
  if (k === "favor" && low.includes("favour")) return true;
  return false;
}

function secretCountForTableSize(n: number): number {
  if (n >= 6) return 2;
  if (n >= 4) return 1;
  return 0;
}

/**
 * After party leaves lobby: deal secret roles from template pack (idempotent).
 */
export async function dealPartySecretsIfNeeded(sessionId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row || row.game_kind !== "party") return;

  const existing = PartySecretsV1Schema.safeParse(row.party_secrets);
  if (existing.success && Object.keys(existing.data.assignments).length > 0) {
    return;
  }

  const cfgParse = PartyConfigV1Schema.safeParse(row.party_config);
  const templateKey = cfgParse.success
    ? cfgParse.data.template_key
    : "default";
  const pack = getPartySecretTemplatePack(templateKey);
  if (!pack.enabled || pack.pool.length === 0) return;

  const participantIds = await listPartyParticipantPlayerIdsLocal(sessionId);
  const nSecret = secretCountForTableSize(participantIds.length);
  if (nSecret === 0) return;

  const shuffledPlayers = seededShuffle(
    [...participantIds],
    `${sessionId}:secret:players`,
  );
  const chosen = shuffledPlayers.slice(0, nSecret);
  const rolePick = seededShuffle(
    [...pack.pool],
    `${sessionId}:secret:roles`,
  ).slice(0, nSecret);

  const assignments: PartySecretsV1["assignments"] = {};
  for (let i = 0; i < chosen.length; i++) {
    const pid = chosen[i]!;
    const role = rolePick[i]!;
    assignments[pid] = {
      role_key: role.roleKey,
      role_label: role.label,
      objectives: role.objectives.map((o) => ({
        id: o.id,
        text: o.text,
        keyword: o.keyword,
        completed: false,
      })),
    };
  }

  const nextSecrets: PartySecretsV1 = {
    version: 1,
    assignments,
    secret_bp_totals: {},
  };

  const [updated] = await db
    .update(sessions)
    .set({
      party_secrets: nextSecrets,
      state_version: row.state_version + 1,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.state_version, row.state_version),
      ),
    )
    .returning({ state_version: sessions.state_version });

  if (updated) {
    await broadcastPartyStateRefresh(sessionId, updated.state_version);
  }
}

/**
 * Keyword objectives: +1 secret BP per newly completed objective on submit.
 */
export async function evaluatePartySecretObjectivesOnSubmit(params: {
  sessionId: string;
  playerId: string;
  lineText: string;
}): Promise<void> {
  const { sessionId, playerId, lineText } = params;
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row || row.game_kind !== "party") return;

  const parsed = PartySecretsV1Schema.safeParse(row.party_secrets);
  if (!parsed.success) return;

  const assign = parsed.data.assignments[playerId];
  if (!assign) return;

  let changed = false;
  const bp = { ...(parsed.data.secret_bp_totals ?? {}) };
  const nextObjectives = assign.objectives.map((o) => {
    if (o.completed) return o;
    const kw = o.keyword?.trim() ?? "";
    if (!kw || !lineMatchesKeyword(lineText, kw)) return o;
    changed = true;
    bp[playerId] = (bp[playerId] ?? 0) + 1;
    return { ...o, completed: true };
  });

  if (!changed) return;

  const nextSecrets: PartySecretsV1 = {
    ...parsed.data,
    assignments: {
      ...parsed.data.assignments,
      [playerId]: {
        ...assign,
        objectives: nextObjectives,
      },
    },
    secret_bp_totals: bp,
  };

  const [updated] = await db
    .update(sessions)
    .set({
      party_secrets: nextSecrets,
      state_version: row.state_version + 1,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.state_version, row.state_version),
      ),
    )
    .returning({ state_version: sessions.state_version });

  if (updated) {
    await broadcastPartyStateRefresh(sessionId, updated.state_version);
  }
}

export async function getPartyMePayloadForUser(params: {
  sessionId: string;
  userId: string;
}): Promise<{
  party: PartyConfigClientView | null;
  me: {
    secretRole: string | null;
    roleKey: string | null;
    bonusObjectives: Array<{ id: string; text: string; completed: boolean }>;
    secretBonusPoints: number;
    /** During anonymous crowd vote, the slot id for this player’s line (hide from ballot). */
    myCrowdVoteSlotId: string | null;
    /** Tiebreak revote: whether this player already submitted a tiebreak line. */
    mySubmittedTiebreak: boolean;
  };
} | null> {
  const { sessionId, userId } = params;
  const [row] = await db
    .select({
      game_kind: sessions.game_kind,
      party_config: sessions.party_config,
      party_secrets: sessions.party_secrets,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row || row.game_kind !== "party") return null;

  const [playerRow] = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(eq(players.session_id, sessionId), eq(players.user_id, userId)),
    )
    .limit(1);
  if (!playerRow) return null;

  const party = partyConfigForSessionPayload(row.party_config, {
    partySecretsRaw: row.party_secrets,
  });

  const rawPartyCfg = PartyConfigV1Schema.safeParse(row.party_config);
  let myCrowdVoteSlotId: string | null = null;
  const voteLikePhase =
    rawPartyCfg.success &&
    (rawPartyCfg.data.party_phase === "vote" ||
      rawPartyCfg.data.party_phase === "tiebreak_vote" ||
      rawPartyCfg.data.party_phase === "finale_tie_vote");
  if (voteLikePhase && rawPartyCfg.success) {
    const owners = rawPartyCfg.data.vote_slot_owner ?? {};
    for (const [slotId, pid] of Object.entries(owners)) {
      if (pid === playerRow.id) {
        myCrowdVoteSlotId = slotId;
        break;
      }
    }
  }

  let mySubmittedTiebreak = false;
  if (
    rawPartyCfg.success &&
    rawPartyCfg.data.party_phase === "tiebreak_submit"
  ) {
    const tb = rawPartyCfg.data.tiebreak_submissions ?? {};
    mySubmittedTiebreak = Boolean(tb[playerRow.id]?.text?.trim());
  }

  const secrets = PartySecretsV1Schema.safeParse(row.party_secrets);
  const assign = secrets.success
    ? secrets.data.assignments[playerRow.id]
    : undefined;

  return {
    party,
    me: {
      secretRole: assign?.role_label ?? null,
      roleKey: assign?.role_key ?? null,
      bonusObjectives:
        assign?.objectives.map((o) => ({
          id: o.id,
          text: o.text,
          completed: Boolean(o.completed),
        })) ?? [],
      secretBonusPoints: secrets.success
        ? (secrets.data.secret_bp_totals?.[playerRow.id] ?? 0)
        : 0,
      myCrowdVoteSlotId,
      mySubmittedTiebreak,
    },
  };
}
