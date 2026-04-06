import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  actions,
  authUsers,
  characters,
  diceRolls,
  memorySummaries,
  narrativeEvents,
  npcStates,
  orchestrationTraces,
  players,
  sceneSnapshots,
  sessions,
  turns,
} from "@/lib/db/schema";
import { resolveCharacterDisplayFields } from "@/lib/characters/display-class";
import {
  PartyConfigV1Schema,
  partyConfigForSessionPayload,
} from "@/lib/schemas/party";
import { CharacterStatsSchema } from "@/lib/schemas/domain";
import { mapNpcRowToCombatantView } from "@/lib/state/npc-combatant-mapper";
import type {
  FeedEntry,
  GamePlayerView,
  GameSessionView,
  NpcCombatantView,
  SessionStatePayload,
  StatEffect,
} from "@/lib/state/game-store";
import { buildPartySessionNarrativeText } from "@/lib/party/party-opening-narrative";
import {
  mergeViewerUserFieldsForPlayer,
  resolvePlayerDisplayName,
  type ViewerIdentityHint,
} from "@/lib/session/player-display-name";
import {
  estimateHostSparksPerChapter,
  normalizeVisualRhythmPreset,
  turnsElapsedInChapter,
} from "@/lib/chapter/chapter-config";
import { getQuestState } from "@/server/services/quest-service";

/** Cap scene_snapshots loaded per hydrate (feed pairing + latest hero image). */
export const SCENE_SNAPSHOT_FEED_LIMIT = 100;

/** Recent actions joined to turns for the session feed (chronicle). */
const FEED_ACTIONS_LIMIT = 90;

/** `state_delta` rows for Chronicle lazy load (not included in `/state` hydrate). */
export const STAT_DELTA_TRACE_LAZY_LIMIT = 280;

const DEFAULT_STATS = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
} as const;

function mapSession(row: typeof sessions.$inferSelect): GameSessionView {
  const tags = row.adventure_tags;
  const gameKind = row.game_kind ?? "campaign";
  const preset = normalizeVisualRhythmPreset(row.visual_rhythm_preset);
  const turnsThisChapter = turnsElapsedInChapter({
    currentRound: row.current_round,
    chapterStartRound: row.chapter_start_round,
  });
  return {
    status: row.status,
    mode: row.mode,
    phase: row.phase,
    campaignMode: row.campaign_mode,
    moduleKey: row.module_key,
    currentRound: row.current_round,
    currentTurnIndex: row.current_turn_index,
    currentPlayerId: row.current_player_id,
    campaignTitle: row.campaign_title,
    stateVersion: row.state_version,
    finalChapterPublished: false,
    joinCode: row.join_code,
    adventurePrompt: row.adventure_prompt,
    adventureTags: Array.isArray(tags) ? tags.map(String) : undefined,
    artDirection: row.art_direction,
    worldBible: row.world_bible,
    gameKind,
    visualRhythmPreset: preset,
    chapterStartRound: row.chapter_start_round,
    chapterIndex: row.chapter_index,
    chapterTurnsElapsed: turnsThisChapter,
    chapterMaxTurns: row.chapter_max_turns,
    chapterImagesUsed: row.chapter_system_images_used,
    chapterImageBudget: row.chapter_system_image_budget,
    estimatedHostSparksPerChapter:
      gameKind === "campaign"
        ? estimateHostSparksPerChapter({ preset, mode: row.mode })
        : undefined,
    sparkPoolBalance: row.spark_pool_balance ?? 0,
    party:
      gameKind === "party"
        ? partyConfigForSessionPayload(row.party_config, {
            partySecretsRaw: row.party_secrets ?? undefined,
          })
        : null,
  };
}

function mapPlayerRow(
  p: typeof players.$inferSelect,
  c: typeof characters.$inferSelect | null,
  displayName: string | null,
): GamePlayerView {
  const base: GamePlayerView = {
    id: p.id,
    userId: p.user_id,
    displayName: displayName?.trim() || undefined,
    characterId: p.character_id,
    seatIndex: p.seat_index,
    isReady: p.is_ready,
    isConnected: p.is_connected,
    isHost: p.is_host,
    isDm: p.is_dm,
  };
  if (c) {
    const visualProfile =
      c.visual_profile &&
      typeof c.visual_profile === "object" &&
      !Array.isArray(c.visual_profile)
        ? (c.visual_profile as Record<string, unknown>)
        : {};
    const portraitRaw = visualProfile.portrait_url;
    const portraitUrl =
      typeof portraitRaw === "string" && portraitRaw.trim().length > 0
        ? portraitRaw
        : undefined;
    const statsParsed = CharacterStatsSchema.safeParse(c.stats);
    const stats = statsParsed.success ? statsParsed.data : { ...DEFAULT_STATS };
    const inventory = Array.isArray(c.inventory)
      ? (c.inventory as Array<Record<string, unknown>>)
      : [];
    const abilities = Array.isArray(c.abilities)
      ? (c.abilities as Array<Record<string, unknown>>)
      : [];
    const conditions = Array.isArray(c.conditions) ? c.conditions : [];
    const { displayClass, mechanicalClass } = resolveCharacterDisplayFields({
      classColumn: c.class,
      visualProfile,
    });
    base.character = {
      name: c.name,
      class: c.class,
      displayClass,
      mechanicalClass,
      race: c.race,
      level: c.level,
      hp: c.hp,
      maxHp: c.max_hp,
      mana: c.mana,
      maxMana: c.max_mana,
      ac: c.ac,
      stats,
      inventory,
      abilities,
      conditions,
      portraitUrl,
    };
  }
  return base;
}

function playerDisplayLabel(
  playersList: GamePlayerView[],
  playerId: string,
): string {
  const p = playersList.find((x) => x.id === playerId);
  if (!p) return "Player";
  return p.character?.name ?? p.displayName ?? `Seat ${p.seatIndex + 1}`;
}

function rawToStatEffects(
  raw: unknown,
  playersList: GamePlayerView[],
  npcNames: Map<string, string>,
): StatEffect[] {
  if (!Array.isArray(raw)) return [];
  const out: StatEffect[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const target_type = o.target_type === "npc" ? "npc" : "player";
    const target_id = String(o.target_id ?? "");
    if (!target_id) continue;
    const targetName =
      target_type === "player"
        ? playerDisplayLabel(playersList, target_id)
        : npcNames.get(target_id) ?? "NPC";
    out.push({
      targetId: target_id,
      targetName,
      hpDelta: typeof o.hp_delta === "number" ? o.hp_delta : 0,
      manaDelta: typeof o.mana_delta === "number" ? o.mana_delta : 0,
      conditionsAdd: Array.isArray(o.conditions_add)
        ? o.conditions_add.filter((x): x is string => typeof x === "string")
        : [],
      conditionsRemove: Array.isArray(o.conditions_remove)
        ? o.conditions_remove.filter((x): x is string => typeof x === "string")
        : [],
      reasoning: typeof o.reasoning === "string" ? o.reasoning : "",
    });
  }
  return out;
}

function sceneImageServingUrlForSession(
  sessionId: string,
  snap: typeof sceneSnapshots.$inferSelect,
): string | undefined {
  const raw = snap.image_url;
  if (!raw?.trim()) return undefined;
  return raw.startsWith("data:")
    ? `/api/sessions/${sessionId}/scene-image/${snap.id}`
    : raw;
}

export type SessionSceneStatusPayload = {
  scenePending: boolean;
  sceneImage: string | null;
  narrativeText: string | null;
  sceneTitle: string | null;
  stateVersion: number;
};

/**
 * Minimal scene/narration slice for polling (avoids full `loadSessionStatePayload`).
 * Same derivation rules as hydrate for party vs campaign.
 */
function deriveSceneDisplaySlice(args: {
  sessionRow: typeof sessions.$inferSelect;
  sessionId: string;
  latestScene: typeof sceneSnapshots.$inferSelect | undefined;
  latestNarrativeText: string | null;
}): Omit<SessionSceneStatusPayload, "stateVersion"> {
  const { sessionRow, sessionId, latestScene, latestNarrativeText } = args;
  let narrativeText = latestNarrativeText;
  const rawSceneImage = latestScene?.image_url ?? null;
  let sceneImage =
    rawSceneImage?.startsWith("data:") && latestScene
      ? `/api/sessions/${sessionId}/scene-image/${latestScene.id}`
      : rawSceneImage;
  const sceneStatusPending =
    latestScene?.image_status === "pending" ||
    latestScene?.image_status === "generating";
  let scenePending = Boolean(rawSceneImage) ? false : sceneStatusPending;

  let sceneTitle =
    sessionRow.campaign_title?.trim() ||
    latestScene?.summary.split("\n")[0]?.trim() ||
    null;

  if (sessionRow.game_kind === "party") {
    const p = PartyConfigV1Schema.safeParse(sessionRow.party_config);
    if (p.success) {
      const pc = p.data;
      if (
        (pc.party_phase === "vote" ||
          pc.party_phase === "forgery_guess" ||
          pc.party_phase === "reveal" ||
          pc.party_phase === "tiebreak_vote" ||
          pc.party_phase === "finale_tie_vote") &&
        pc.merged_beat?.trim()
      ) {
        narrativeText = pc.merged_beat.trim();
      } else if (
        pc.party_phase === "submit" ||
        pc.party_phase === "tiebreak_submit"
      ) {
        narrativeText = buildPartySessionNarrativeText({
          partyPhase: pc.party_phase,
          sessionRow: {
            adventure_prompt: sessionRow.adventure_prompt,
            adventure_tags: sessionRow.adventure_tags,
            world_bible: sessionRow.world_bible,
            art_direction: sessionRow.art_direction,
          },
          partyConfig: pc,
        });
      } else if (pc.party_phase === "ended") {
        narrativeText =
          pc.merged_beat?.trim() ||
          pc.carry_forward?.trim() ||
          narrativeText;
      }
      const art =
        pc.scene_image_by_round?.[String(pc.round_index)]?.trim() ??
        pc.scene_image_url?.trim();
      if (art) {
        sceneImage = art;
        scenePending = false;
      } else if (
        (pc.party_phase === "vote" ||
          pc.party_phase === "forgery_guess" ||
          pc.party_phase === "reveal" ||
          pc.party_phase === "tiebreak_vote" ||
          pc.party_phase === "finale_tie_vote") &&
        pc.merged_beat?.trim()
      ) {
        scenePending = true;
      } else if (
        (pc.party_phase === "submit" || pc.party_phase === "tiebreak_submit") &&
        pc.round_scene_beat?.trim()
      ) {
        scenePending = true;
      }
    }
  }
  if (sessionRow.game_kind === "party") {
    const pr = PartyConfigV1Schema.safeParse(sessionRow.party_config);
    if (pr.success) {
      sceneTitle = `Party · Round ${pr.data.round_index} / ${pr.data.total_rounds}`;
    }
  }

  return {
    sceneImage,
    scenePending,
    narrativeText,
    sceneTitle,
  };
}

export async function loadSessionSceneStatus(
  sessionId: string,
): Promise<SessionSceneStatusPayload | null> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessionRow) {
    return null;
  }

  const [latestScene] = await db
    .select()
    .from(sceneSnapshots)
    .where(eq(sceneSnapshots.session_id, sessionId))
    .orderBy(desc(sceneSnapshots.created_at))
    .limit(1);

  let latestNarrativeText: string | null = null;
  if (sessionRow.game_kind !== "party") {
    const [nr] = await db
      .select({ scene_text: narrativeEvents.scene_text })
      .from(narrativeEvents)
      .where(eq(narrativeEvents.session_id, sessionId))
      .orderBy(desc(narrativeEvents.created_at))
      .limit(1);
    latestNarrativeText = nr?.scene_text ?? null;
  }

  const slice = deriveSceneDisplaySlice({
    sessionRow,
    sessionId,
    latestScene: latestScene ?? undefined,
    latestNarrativeText,
  });

  return {
    ...slice,
    stateVersion: sessionRow.state_version,
  };
}

function buildStatDeltaTraceFeedEntries(
  traceRows: (typeof orchestrationTraces.$inferSelect)[],
  mappedPlayers: GamePlayerView[],
  npcNamesMap: Map<string, string>,
  turnRoundById: Map<string, number>,
): FeedEntry[] {
  const traceFeed: FeedEntry[] = [];
  for (const row of [...traceRows].reverse()) {
    const out = row.output_summary;
    if (!out || typeof out !== "object") continue;
    const summary = out as Record<string, unknown>;
    if (row.step_name !== "state_delta") continue;
    const effects = rawToStatEffects(
      summary.consequence_effects,
      mappedPlayers,
      npcNamesMap,
    );
    if (effects.length === 0) continue;
    const text = statEffectsToFeedText(effects);
    if (!text.trim()) continue;
    traceFeed.push({
      id: `trace:stat:${row.id}`,
      type: "stat_change",
      text,
      timestamp: row.created_at.toISOString(),
      statEffects: effects,
      turnId: row.turn_id ?? undefined,
      roundNumber: row.turn_id
        ? turnRoundById.get(row.turn_id)
        : undefined,
    });
  }
  return traceFeed;
}

/**
 * Stat-change rows from orchestration traces — for Chronicle only (reduces `/state` payload).
 */
export async function loadStatDeltaTraceFeedForSession(
  sessionId: string,
  viewer?: ViewerIdentityHint | null,
): Promise<FeedEntry[]> {
  const playerRows = await db
    .select({
      player: players,
      character: characters,
      userName: authUsers.name,
      userEmail: authUsers.email,
    })
    .from(players)
    .leftJoin(characters, eq(characters.player_id, players.id))
    .leftJoin(authUsers, eq(authUsers.id, players.user_id))
    .where(eq(players.session_id, sessionId));

  const mappedPlayers = playerRows
    .map((r) => {
      const { userName, userEmail } = mergeViewerUserFieldsForPlayer({
        playerUserId: r.player.user_id,
        dbUserName: r.userName,
        dbUserEmail: r.userEmail,
        viewer,
      });
      return mapPlayerRow(
        r.player,
        r.character,
        resolvePlayerDisplayName({
          characterName: r.character?.name,
          userName,
          userEmail,
        }),
      );
    })
    .sort((a, b) => a.seatIndex - b.seatIndex);

  const npcNamesMap = new Map(
    (
      await db
        .select({ id: npcStates.id, name: npcStates.name })
        .from(npcStates)
        .where(eq(npcStates.session_id, sessionId))
    ).map((r) => [r.id, r.name]),
  );

  const turnRoundById = new Map(
    (
      await db
        .select({ id: turns.id, round_number: turns.round_number })
        .from(turns)
        .where(eq(turns.session_id, sessionId))
    ).map((t) => [t.id, t.round_number]),
  );

  const traceRows = await db
    .select()
    .from(orchestrationTraces)
    .where(
      and(
        eq(orchestrationTraces.session_id, sessionId),
        inArray(orchestrationTraces.step_name, ["state_delta"]),
      ),
    )
    .orderBy(desc(orchestrationTraces.created_at))
    .limit(STAT_DELTA_TRACE_LAZY_LIMIT);

  return buildStatDeltaTraceFeedEntries(
    traceRows,
    mappedPlayers,
    npcNamesMap,
    turnRoundById,
  );
}

function statEffectsToFeedText(effects: StatEffect[]): string {
  const parts: string[] = [];
  for (const e of effects) {
    const chunks: string[] = [];
    if (e.hpDelta !== 0) {
      chunks.push(`${e.hpDelta > 0 ? "+" : ""}${e.hpDelta} HP`);
    }
    if (e.manaDelta !== 0) {
      chunks.push(`${e.manaDelta > 0 ? "+" : ""}${e.manaDelta} MP`);
    }
    if (e.conditionsAdd.length) {
      chunks.push(`+${e.conditionsAdd.join(", ")}`);
    }
    if (e.conditionsRemove.length) {
      chunks.push(`-${e.conditionsRemove.join(", ")}`);
    }
    if (chunks.length) parts.push(`${e.targetName}: ${chunks.join(", ")}`);
  }
  return parts.join(" | ");
}

/**
 * Read-only snapshot for gameplay hydrate and room display (no presence writes).
 */
export async function loadSessionStatePayload(
  sessionId: string,
  viewer?: ViewerIdentityHint | null,
): Promise<SessionStatePayload | null> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessionRow) {
    return null;
  }

  const playerRows = await db
    .select({
      player: players,
      character: characters,
      userName: authUsers.name,
      userEmail: authUsers.email,
    })
    .from(players)
    .leftJoin(characters, eq(characters.player_id, players.id))
    .leftJoin(authUsers, eq(authUsers.id, players.user_id))
    .where(eq(players.session_id, sessionId));

  const mappedPlayers = playerRows
    .map((r) => {
      const { userName, userEmail } = mergeViewerUserFieldsForPlayer({
        playerUserId: r.player.user_id,
        dbUserName: r.userName,
        dbUserEmail: r.userEmail,
        viewer,
      });
      return mapPlayerRow(
        r.player,
        r.character,
        resolvePlayerDisplayName({
          characterName: r.character?.name,
          userName,
          userEmail,
        }),
      );
    })
    .sort((a, b) => a.seatIndex - b.seatIndex);

  const narrativeRows = await db
    .select({
      ev: narrativeEvents,
      turn_round: turns.round_number,
    })
    .from(narrativeEvents)
    .leftJoin(turns, eq(turns.id, narrativeEvents.turn_id))
    .where(eq(narrativeEvents.session_id, sessionId))
    .orderBy(desc(narrativeEvents.created_at))
    .limit(20);

  const snapshotRowsDesc = await db
    .select()
    .from(sceneSnapshots)
    .where(eq(sceneSnapshots.session_id, sessionId))
    .orderBy(desc(sceneSnapshots.created_at))
    .limit(SCENE_SNAPSHOT_FEED_LIMIT);

  const snapshotRows = [...snapshotRowsDesc].reverse();

  const latestScene =
    snapshotRows.length > 0
      ? snapshotRows[snapshotRows.length - 1]!
      : undefined;

  const chronological = [...narrativeRows].reverse();
  const narrationFeed: FeedEntry[] = chronological.map(({ ev, turn_round }) => {
    const snap = snapshotRows.find(
      (s) =>
        s.created_at >= ev.created_at &&
        typeof s.image_url === "string" &&
        s.image_url.trim().length > 0,
    );
    const imageUrl = snap
      ? sceneImageServingUrlForSession(sessionId, snap)
      : undefined;
    return {
      id: ev.id,
      type: "narration" as const,
      text: ev.scene_text,
      detail:
        ev.visible_changes.length > 0
          ? ev.visible_changes.join(" · ")
          : undefined,
      timestamp: ev.created_at.toISOString(),
      turnId: ev.turn_id ?? undefined,
      roundNumber: turn_round ?? undefined,
      ...(imageUrl ? { imageUrl } : {}),
    };
  });

  const actionTurnRows = await db
    .select({
      action: actions,
      turn: turns,
    })
    .from(actions)
    .innerJoin(turns, eq(turns.id, actions.turn_id))
    .where(eq(turns.session_id, sessionId))
    .orderBy(desc(actions.created_at))
    .limit(FEED_ACTIONS_LIMIT);

  const actionIds = actionTurnRows.map((r) => r.action.id);
  const diceQuery =
    actionIds.length > 0
      ? await db
          .select()
          .from(diceRolls)
          .where(inArray(diceRolls.action_id, actionIds))
      : [];

  const turnByActionId = new Map<
    string,
    (typeof actionTurnRows)[number]["turn"]
  >();
  for (const row of actionTurnRows) {
    turnByActionId.set(row.action.id, row.turn);
  }

  const diceSorted = [...diceQuery].sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime(),
  );

  /** Matches live Pusher "dice-rolling" rows (context + dice type as detail). */
  const diceRollingEntries: FeedEntry[] = diceSorted.map((roll) => {
    const turn = turnByActionId.get(roll.action_id);
    const ms = roll.created_at.getTime() - 12;
    return {
      id: `dice:${roll.id}:rolling`,
      type: "dice" as const,
      text: roll.context,
      detail: roll.roll_type,
      timestamp: new Date(ms).toISOString(),
      turnId: turn?.id,
      roundNumber: turn?.round_number,
    };
  });

  const actionEntries: FeedEntry[] = actionTurnRows.map(({ action, turn }) => ({
    id: `action:${action.id}`,
    type: "action" as const,
    playerName: playerDisplayLabel(mappedPlayers, turn.player_id),
    playerId: turn.player_id,
    text: action.raw_input,
    timestamp: action.created_at.toISOString(),
    turnId: turn.id,
    roundNumber: turn.round_number,
  }));

  const diceEntries: FeedEntry[] = diceSorted.map((roll) => {
    const turn = turnByActionId.get(roll.action_id);
    return {
      id: `dice:${roll.id}`,
      type: "dice" as const,
      text: `${roll.roll_type.toUpperCase()}: ${roll.roll_value} + ${roll.modifier} = ${roll.total}`,
      detail: roll.result,
      timestamp: roll.created_at.toISOString(),
      turnId: turn?.id,
      roundNumber: turn?.round_number,
    };
  });

  const npcRows = await db
    .select()
    .from(npcStates)
    .where(eq(npcStates.session_id, sessionId));

  const feed: FeedEntry[] = [
    ...actionEntries,
    ...diceRollingEntries,
    ...diceEntries,
    ...narrationFeed,
  ].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });

  const latestNarrative = narrativeRows[0];
  const sceneSlice = deriveSceneDisplaySlice({
    sessionRow,
    sessionId,
    latestScene,
    latestNarrativeText: latestNarrative?.ev.scene_text ?? null,
  });
  let { narrativeText, sceneImage, scenePending, sceneTitle } = sceneSlice;

  const [dmAwaitingRow] = await db
    .select({
      id: turns.id,
      player_id: turns.player_id,
    })
    .from(turns)
    .where(
      and(eq(turns.session_id, sessionId), eq(turns.status, "awaiting_dm")),
    )
    .orderBy(desc(turns.started_at))
    .limit(1);

  const dmAwaiting = dmAwaitingRow
    ? {
        turnId: dmAwaitingRow.id,
        actingPlayerId: dmAwaitingRow.player_id,
      }
    : null;

  let activeTurnId: string | null = null;
  if (sessionRow.current_player_id) {
    const [awaitingTurnRow] = await db
      .select({ id: turns.id })
      .from(turns)
      .where(
        and(
          eq(turns.session_id, sessionId),
          eq(turns.status, "awaiting_input"),
          eq(turns.player_id, sessionRow.current_player_id),
        ),
      )
      .orderBy(desc(turns.started_at))
      .limit(1);
    activeTurnId = awaitingTurnRow?.id ?? null;
  }
  if (!activeTurnId) {
    const [processingTurnRow] = await db
      .select({ id: turns.id })
      .from(turns)
      .where(
        and(
          eq(turns.session_id, sessionId),
          eq(turns.status, "processing"),
        ),
      )
      .orderBy(desc(turns.started_at))
      .limit(1);
    activeTurnId = processingTurnRow?.id ?? null;
  }
  if (!activeTurnId && dmAwaitingRow) {
    activeTurnId = dmAwaitingRow.id;
  }

  const [finalChapterRow] = await db
    .select({ id: narrativeEvents.id })
    .from(narrativeEvents)
    .where(
      and(
        eq(narrativeEvents.session_id, sessionId),
        eq(narrativeEvents.tone, "epilogue"),
      ),
    )
    .orderBy(desc(narrativeEvents.created_at))
    .limit(1);

  const quest =
    sessionRow.game_kind === "party"
      ? null
      : await getQuestState(sessionId);
  const mappedSession = mapSession(sessionRow);
  mappedSession.finalChapterPublished = Boolean(finalChapterRow);

  const summaryRows = await db
    .select({
      id: memorySummaries.id,
      summary_type: memorySummaries.summary_type,
      content: memorySummaries.content,
      turn_range_start: memorySummaries.turn_range_start,
      turn_range_end: memorySummaries.turn_range_end,
      created_at: memorySummaries.created_at,
    })
    .from(memorySummaries)
    .where(eq(memorySummaries.session_id, sessionId))
    .orderBy(desc(memorySummaries.created_at))
    .limit(10);

  const rollingMemories = summaryRows
    .filter((r) => r.summary_type === "rolling")
    .map((r) => ({
      id: r.id,
      turnRangeStart: r.turn_range_start,
      turnRangeEnd: r.turn_range_end,
      content: r.content as {
        key_events?: string[];
        active_hooks?: string[];
        npc_relationships?: string[];
        world_changes?: string[];
      },
      createdAt: r.created_at.toISOString(),
    }));

  const npcs: NpcCombatantView[] = npcRows.map(mapNpcRowToCombatantView);

  return {
    session: mappedSession,
    players: mappedPlayers,
    npcs,
    feed,
    sceneImage,
    sceneTitle,
    narrativeText,
    scenePending,
    dmAwaiting,
    activeTurnId,
    quest,
    rollingMemories,
  };
}
