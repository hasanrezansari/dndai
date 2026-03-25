import { randomInt } from "node:crypto";

import { and, count, eq, max, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { authUsers, players, sessions } from "@/lib/db/schema";
import type { Player, Session } from "@/lib/schemas/domain";
import type { CampaignMode, SessionMode } from "@/lib/schemas/enums";

const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)]!;
  }
  return code;
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
  moduleKey?: string;
}): Promise<{ sessionId: string; joinCode: string }> {
  const joinCode = await allocateUniqueJoinCode();
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
      module_key: params.moduleKey ?? null,
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
  if (playerRows.length < 2) {
    return false;
  }
  const connected = playerRows.filter((p) => p.is_connected);
  if (connected.length < 2) {
    return false;
  }
  return connected.every((p) => p.is_ready);
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
