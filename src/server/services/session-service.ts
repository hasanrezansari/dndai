import { randomInt } from "node:crypto";

import { and, count, eq, max, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { authUsers, players, sessions } from "@/lib/db/schema";
import {
  JOIN_CODE_ALPHABET,
  normalizeJoinCodeForLookup,
} from "@/lib/join-code";
import type { Player, Session } from "@/lib/schemas/domain";
import type { CampaignMode, GameKind, SessionMode } from "@/lib/schemas/enums";
import {
  DEFAULT_PARTY_TOTAL_ROUNDS,
  getDefaultPartyTemplateKeyForBrand,
} from "@/lib/party/party-templates";
import { createInitialPartyConfig } from "@/lib/schemas/party";

function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)]!;
  }
  return code;
}

/** Read-only display entry by room code; lobby, active, or paused — not ended. */
export async function findSessionIdByJoinCodeForDisplayWatch(
  joinCode: string,
): Promise<string | null> {
  const normalized = normalizeJoinCodeForLookup(joinCode);
  const [row] = await db
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(eq(sessions.join_code, normalized))
    .limit(1);
  if (!row || row.status === "ended") return null;
  return row.id;
}

function mapSessionRow(row: typeof sessions.$inferSelect): Session {
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  } as Session;
}

function mapPlayerRow(
  row: typeof players.$inferSelect,
  name?: string | null,
): Player {
  return {
    ...row,
    name: name ?? null,
    joined_at: row.joined_at.toISOString(),
  } as Player;
}

export class SessionNotFoundError extends Error {
  constructor() {
    super("Session not found");
    this.name = "SessionNotFoundError";
  }
}

export class JoinSessionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 404 | 409,
  ) {
    super(message);
    this.name = "JoinSessionError";
  }
}

export class PlayerNotFoundError extends Error {
  constructor() {
    super("Player not found");
    this.name = "PlayerNotFoundError";
  }
}

export class IncreaseMaxPlayersError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 403 | 404 | 409,
  ) {
    super(message);
    this.name = "IncreaseMaxPlayersError";
  }
}

async function allocateUniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 32; attempt++) {
    const code = generateJoinCode();
    const existing = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.join_code, code))
      .limit(1);
    if (existing.length === 0) {
      return code;
    }
  }
  throw new Error("Failed to allocate join code");
}

export async function createSession(params: {
  mode: SessionMode;
  campaignMode: CampaignMode;
  maxPlayers: number;
  hostUserId: string;
  adventurePrompt?: string;
  adventureTags?: string[];
  artDirection?: string;
  worldBible?: string;
  moduleKey?: string;
  /** Default `campaign`. `party` seeds `party_config` v1 in lobby. */
  gameKind?: GameKind;
  templateKey?: string;
  partyTotalRounds?: number;
  /** When true, merge adds an AI “anonymous interjection” line (instigator). */
  partyInstigatorEnabled?: boolean;
  /** Analytics only; stored on session row, never used by turn/quest/narration. */
  acquisitionSource?: string;
}): Promise<{ sessionId: string; joinCode: string }> {
  const joinCode = await allocateUniqueJoinCode();
  const gameKind: GameKind = params.gameKind ?? "campaign";
  const partyConfig =
    gameKind === "party"
      ? createInitialPartyConfig(
          params.templateKey?.trim() || getDefaultPartyTemplateKeyForBrand(),
          params.partyTotalRounds ?? DEFAULT_PARTY_TOTAL_ROUNDS,
          {
            instigatorEnabled: Boolean(params.partyInstigatorEnabled),
          },
        )
      : null;
  const [session] = await db
    .insert(sessions)
    .values({
      mode: params.mode,
      campaign_mode: params.campaignMode,
      status: "lobby",
      phase: "exploration",
      state_version: 0,
      max_players: params.maxPlayers,
      join_code: joinCode,
      host_user_id: params.hostUserId,
      adventure_prompt: params.adventurePrompt ?? null,
      adventure_tags: params.adventureTags?.length ? params.adventureTags : null,
      art_direction: params.artDirection?.trim() || null,
      world_bible: params.worldBible?.trim() || null,
      module_key: params.moduleKey ?? null,
      game_kind: gameKind,
      party_config: partyConfig,
      acquisition_source: params.acquisitionSource?.trim() || null,
    })
    .returning();
  if (!session) {
    throw new Error("Failed to create session");
  }
  try {
    await db.insert(players).values({
      session_id: session.id,
      user_id: params.hostUserId,
      seat_index: 0,
      is_host: true,
      is_dm: params.mode === "human_dm",
      is_ready: false,
    });
  } catch (e) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    throw e;
  }
  return { sessionId: session.id, joinCode: session.join_code };
}

export async function joinSession(params: {
  joinCode: string;
  userId: string;
}): Promise<{ sessionId: string; playerId: string }> {
  const normalized = params.joinCode.trim().toUpperCase();
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.join_code, normalized), eq(sessions.status, "lobby")))
    .limit(1);
  if (!session) {
    throw new JoinSessionError("Session not found", 404);
  }
  const [existing] = await db
    .select()
    .from(players)
    .where(and(eq(players.session_id, session.id), eq(players.user_id, params.userId)))
    .limit(1);
  if (existing) {
    return { sessionId: session.id, playerId: existing.id };
  }
  const countRows = await db
    .select({ value: count() })
    .from(players)
    .where(eq(players.session_id, session.id));
  const playerCount = Number(countRows[0]?.value ?? 0);
  if (playerCount >= session.max_players) {
    throw new JoinSessionError("Session is full", 409);
  }
  const seatRows = await db
    .select({ maxSeat: max(players.seat_index) })
    .from(players)
    .where(eq(players.session_id, session.id));
  const maxSeat = seatRows[0]?.maxSeat;
  const nextSeat = (maxSeat ?? -1) + 1;
  const [player] = await db
    .insert(players)
    .values({
      session_id: session.id,
      user_id: params.userId,
      seat_index: nextSeat,
      is_host: false,
      is_ready: false,
    })
    .returning();
  if (!player) {
    throw new Error("Failed to join session");
  }
  return { sessionId: session.id, playerId: player.id };
}

export async function getSession(
  sessionId: string,
): Promise<Session & { players: Player[] }> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessionRow) {
    throw new SessionNotFoundError();
  }
  const playerRows = await db
    .select({
      player: players,
      userName: authUsers.name,
    })
    .from(players)
    .leftJoin(authUsers, eq(authUsers.id, players.user_id))
    .where(eq(players.session_id, sessionId));
  return {
    ...mapSessionRow(sessionRow),
    players: playerRows.map((r) => mapPlayerRow(r.player, r.userName)),
  };
}

export async function toggleReady(
  playerId: string,
  sessionId: string,
): Promise<boolean> {
  const [player] = await db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.session_id, sessionId)))
    .limit(1);
  if (!player) {
    throw new PlayerNotFoundError();
  }
  const next = !player.is_ready;
  await db.update(players).set({ is_ready: next }).where(eq(players.id, playerId));
  return next;
}

export async function canStartSession(sessionId: string): Promise<boolean> {
  const playerRows = await db
    .select()
    .from(players)
    .where(eq(players.session_id, sessionId));
  if (playerRows.length < 1) {
    return false;
  }
  return playerRows.every((p) => p.is_connected && p.is_ready);
}

/** Host-only while in lobby; new cap must exceed current max_players and be ≤ 6. */
export async function increaseSessionMaxPlayers(params: {
  sessionId: string;
  actingUserId: string;
  newMaxPlayers: number;
}): Promise<void> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);
  if (!sessionRow) {
    throw new SessionNotFoundError();
  }
  if (sessionRow.status !== "lobby") {
    throw new IncreaseMaxPlayersError("Session not in lobby", 409);
  }
  if (sessionRow.host_user_id !== params.actingUserId) {
    throw new IncreaseMaxPlayersError("Forbidden", 403);
  }
  const next = params.newMaxPlayers;
  if (!Number.isInteger(next) || next <= sessionRow.max_players || next > 6) {
    throw new IncreaseMaxPlayersError(
      "Invalid max_players (must increase, max 6)",
      400,
    );
  }
  const countRows = await db
    .select({ value: count() })
    .from(players)
    .where(eq(players.session_id, params.sessionId));
  const playerCount = Number(countRows[0]?.value ?? 0);
  if (next < playerCount) {
    throw new IncreaseMaxPlayersError(
      "max_players cannot be below current party size",
      400,
    );
  }
  const [updated] = await db
    .update(sessions)
    .set({
      max_players: next,
      state_version: sql`${sessions.state_version} + 1`,
      updated_at: new Date(),
    })
    .where(
      and(eq(sessions.id, params.sessionId), eq(sessions.status, "lobby")),
    )
    .returning({ id: sessions.id });
  if (!updated) {
    throw new IncreaseMaxPlayersError("Could not update session", 409);
  }
}

export class SessionLobbyUpdateError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 403 | 404 | 409,
  ) {
    super(message);
    this.name = "SessionLobbyUpdateError";
  }
}

/** Host-only: edit adventure seed / world bible / tags while status is lobby. */
export async function updateSessionLobbyPremise(params: {
  sessionId: string;
  actingUserId: string;
  adventure_prompt?: string | null;
  world_bible?: string | null;
  art_direction?: string | null;
  adventure_tags?: string[] | null;
}): Promise<void> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);
  if (!row) throw new SessionNotFoundError();
  if (row.host_user_id !== params.actingUserId) {
    throw new SessionLobbyUpdateError("Forbidden", 403);
  }
  if (row.status !== "lobby") {
    throw new SessionLobbyUpdateError("Session already started", 409);
  }

  const [updated] = await db
    .update(sessions)
    .set({
      updated_at: new Date(),
      state_version: sql`${sessions.state_version} + 1`,
      ...(params.adventure_prompt !== undefined && {
        adventure_prompt: params.adventure_prompt,
      }),
      ...(params.world_bible !== undefined && { world_bible: params.world_bible }),
      ...(params.art_direction !== undefined && {
        art_direction: params.art_direction,
      }),
      ...(params.adventure_tags !== undefined && {
        adventure_tags:
          params.adventure_tags && params.adventure_tags.length > 0
            ? params.adventure_tags
            : null,
      }),
    })
    .where(and(eq(sessions.id, params.sessionId), eq(sessions.status, "lobby")))
    .returning({ id: sessions.id });
  if (!updated) {
    throw new SessionLobbyUpdateError("Could not update session", 409);
  }
}

export async function startSession(sessionId: string): Promise<boolean> {
  const [row] = await db
    .update(sessions)
    .set({
      status: "active",
      state_version: sql`${sessions.state_version} + 1`,
      updated_at: new Date(),
    })
    .where(and(eq(sessions.id, sessionId), eq(sessions.status, "lobby")))
    .returning({ id: sessions.id });
  return Boolean(row);
}
