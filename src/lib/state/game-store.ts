import { create } from "zustand";

import type { CharacterStats } from "@/lib/schemas/domain";
import type { PartyConfigClientView } from "@/lib/schemas/party";

export type ActiveSheet = "character" | "party" | "journal";

export interface FeedEntry {
  id: string;
  type: "action" | "dice" | "narration" | "state_change" | "stat_change" | "system";
  playerName?: string;
  /** Acting player for this row (when known). */
  playerId?: string;
  /** Turn this row belongs to — groups Chronicle cards when set. */
  turnId?: string;
  roundNumber?: number;
  text: string;
  detail?: string;
  timestamp: string;
  highlight?: boolean;
  imageUrl?: string;
  statEffects?: StatEffect[];
}

export interface StatEffect {
  targetId: string;
  targetName: string;
  hpDelta: number;
  manaDelta: number;
  conditionsAdd: string[];
  conditionsRemove: string[];
  reasoning: string;
}

export interface StatPopup {
  id: string;
  playerId: string;
  label: string;
  color: "red" | "green" | "blue";
  createdAt: number;
}

export interface GameSessionView {
  status: string;
  mode: string;
  phase: string;
  campaignMode?: string;
  moduleKey?: string | null;
  currentRound: number;
  currentTurnIndex: number;
  currentPlayerId: string | null;
  campaignTitle: string | null;
  stateVersion: number;
  finalChapterPublished?: boolean;
  /** Room code for TV watch flow; omitted in read-only display API responses. */
  joinCode?: string;
  adventurePrompt?: string | null;
  /** Optional lobby tone chips for AI context. */
  adventureTags?: string[];
  artDirection?: string | null;
  /** Long-form premise / world bible from host. */
  worldBible?: string | null;
  /** `campaign` (default RPG) or `party` (Jackbox-style). */
  gameKind?: string;
  /** Present when `gameKind === "party"`; sanitized server state. */
  party?: PartyConfigClientView | null;
  /** Campaign chapter pacing (Standard / Cinematic). */
  visualRhythmPreset?: "standard" | "cinematic";
  chapterStartRound?: number;
  chapterIndex?: number;
  chapterTurnsElapsed?: number;
  chapterMaxTurns?: number;
  chapterImagesUsed?: number;
  chapterImageBudget?: number;
  /** Rough host Sparks hint per chapter (`ai_dm` campaign only). */
  estimatedHostSparksPerChapter?: number;
  /** Table-funded Sparks (session pool); spent before host wallet on AI charges. */
  sparkPoolBalance?: number;
}

export interface QuestProgressView {
  objectiveLeads?: Array<{
    id: string;
    text: string;
    confidence: number;
    updatedRound: number;
  }>;
  objective: string;
  subObjectives?: string[];
  progress: number;
  risk: number;
  status: "active" | "ready_to_end" | "failed";
  endingVote?: {
    open: boolean;
    reason: "objective_complete" | "party_defeated";
    initiatedRound: number;
    cooldownUntilRound: number;
    failedAttempts: number;
    requiredYes: number;
    eligibleVoterIds: string[];
    votes: Record<string, "end_now" | "continue">;
  } | null;
}

export interface GamePlayerView {
  id: string;
  userId: string;
  displayName?: string;
  characterId: string | null;
  seatIndex: number;
  isReady: boolean;
  isConnected: boolean;
  isHost: boolean;
  isDm: boolean;
  character?: {
    name: string;
    /** Raw DB class column (may be preset key or legacy display slug). */
    class: string;
    /** Player-facing label (custom display_name or preset label). */
    displayClass: string;
    /** Preset mechanical key for icons/rules (warrior, mage, …). */
    mechanicalClass: string;
    race: string;
    level: number;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    ac: number;
    stats: CharacterStats;
    inventory: Array<Record<string, unknown>>;
    abilities: Array<Record<string, unknown>>;
    conditions: string[];
    portraitUrl?: string;
  };
}

/** Client-facing hostile / NPC row from `npc_states` (+ optional `visual_profile` combat hints). */
export interface NpcCombatantView {
  id: string;
  name: string;
  role: string;
  attitude: string;
  status: string;
  location: string;
  notes: string;
  revealLevel: "none" | "partial" | "full";
  ac?: number;
  hp?: number;
  maxHp?: number;
  weakPoints?: string[];
  attacks?: string;
  portraitUrl?: string;
  portraitStatus?: "locked" | "ready";
}

export interface RollingMemoryView {
  id: string;
  turnRangeStart: number;
  turnRangeEnd: number;
  content: {
    key_events?: string[];
    active_hooks?: string[];
    npc_relationships?: string[];
    world_changes?: string[];
  };
  createdAt: string;
}

export interface DiceOverlayData {
  context: string;
  diceType: string;
  rollValue: number;
  modifier: number;
  total: number;
  result: string;
}

/** Partial sync from `GET .../scene-status` (host / room display fallback poll). */
export type SceneStatusHydratePatch = {
  sceneImage?: string | null;
  scenePending?: boolean;
  narrativeText?: string | null;
  sceneTitle?: string | null;
  stateVersion?: number;
};

/** Body shape from `GET /api/sessions/[id]/state` — used for hydrate and incremental sync. */
export type SessionStatePayload = {
  session: GameSessionView;
  players: GamePlayerView[];
  feed?: FeedEntry[];
  sceneImage?: string | null;
  sceneTitle?: string | null;
  narrativeText?: string | null;
  scenePending?: boolean;
  dmAwaiting?: { turnId: string; actingPlayerId: string } | null;
  quest?: QuestProgressView | null;
  rollingMemories?: RollingMemoryView[];
  npcs?: NpcCombatantView[];
  /** Open turn id for Pusher event matching (`turn-started` / `narration-update`). */
  activeTurnId?: string | null;
};

interface GameState {
  sessionId: string | null;
  session: GameSessionView | null;
  players: GamePlayerView[];
  currentPlayerId: string | null;
  feed: FeedEntry[];
  sceneImage: string | null;
  previousSceneImage: string | null;
  sceneTitle: string | null;
  scenePending: boolean;
  narrativeText: string | null;
  isThinking: boolean;
  diceOverlay: DiceOverlayData | null;
  activeSheet: ActiveSheet | null;
  isDm: boolean;
  waitingForDm: boolean;
  dmAwaiting: { turnId: string; actingPlayerId: string } | null;
  dmDc: number | null;
  quest: QuestProgressView | null;
  rollingMemories: RollingMemoryView[];
  statPopups: StatPopup[];
  hpFlash: Record<string, "damage" | "heal">;
  /** Latest turn from `turn-started` — fallback when events omit `turn_id`. */
  activeTurnId: string | null;
  npcs: NpcCombatantView[];

  setSessionId: (id: string) => void;
  setSession: (session: GameState["session"]) => void;
  setPlayers: (players: GameState["players"]) => void;
  setNpcs: (npcs: NpcCombatantView[]) => void;
  setCurrentPlayerId: (id: string) => void;
  updatePlayer: (
    playerId: string,
    updates: Partial<GamePlayerView>,
  ) => void;
  addFeedEntry: (entry: FeedEntry) => void;
  attachImageToLatestNarration: (imageUrl: string) => void;
  setSceneImage: (url: string) => void;
  setSceneTitle: (title: string) => void;
  setScenePending: (pending: boolean) => void;
  setNarrativeText: (text: string | null) => void;
  setIsThinking: (thinking: boolean) => void;
  showDiceOverlay: (data: DiceOverlayData) => void;
  hideDiceOverlay: () => void;
  updateSessionField: <K extends keyof GameSessionView>(
    field: K,
    value: GameSessionView[K],
  ) => void;
  hydrate: (data: SessionStatePayload) => void;
  /**
   * Apply canonical session fields from `/state` without replacing `feed` or UI-only
   * slices (`isThinking`, overlays). Used after Pusher `state-update` and scene polls.
   */
  patchSessionFromStateApi: (data: SessionStatePayload) => void;
  patchSceneHydrateFromMinimalApi: (data: SceneStatusHydratePatch) => void;
  reset: () => void;
  openSheet: (sheet: ActiveSheet) => void;
  closeSheet: () => void;
  setWaitingForDm: (waiting: boolean) => void;
  setIsDm: (isDm: boolean) => void;
  setDmAwaiting: (
    value: { turnId: string; actingPlayerId: string } | null,
  ) => void;
  setDmDc: (dc: number | null) => void;
  setQuest: (quest: QuestProgressView | null) => void;
  setRollingMemories: (memories: RollingMemoryView[]) => void;
  addStatPopups: (popups: StatPopup[]) => void;
  removeStatPopup: (id: string) => void;
  setHpFlash: (flash: Record<string, "damage" | "heal">) => void;
  setActiveTurnId: (id: string | null) => void;
}

/** Round rollup rows use `detail: "Round N"` — skip when attaching scene art. */
export function isRoundRollupNarration(entry: FeedEntry): boolean {
  return (
    entry.type === "narration" &&
    typeof entry.detail === "string" &&
    /^Round \d+$/.test(entry.detail.trim())
  );
}

const emptyState = {
  sessionId: null as string | null,
  session: null as GameSessionView | null,
  players: [] as GamePlayerView[],
  currentPlayerId: null as string | null,
  feed: [] as FeedEntry[],
  sceneImage: null as string | null,
  previousSceneImage: null as string | null,
  sceneTitle: null as string | null,
  scenePending: false,
  narrativeText: null as string | null,
  isThinking: false,
  diceOverlay: null as DiceOverlayData | null,
  activeSheet: null as ActiveSheet | null,
  isDm: false,
  waitingForDm: false,
  dmAwaiting: null as { turnId: string; actingPlayerId: string } | null,
  dmDc: null as number | null,
  quest: null as QuestProgressView | null,
  rollingMemories: [] as RollingMemoryView[],
  statPopups: [] as StatPopup[],
  hpFlash: {} as Record<string, "damage" | "heal">,
  activeTurnId: null as string | null,
  npcs: [] as NpcCombatantView[],
};

export const useGameStore = create<GameState>((set) => ({
  ...emptyState,

  setSessionId: (id) => set({ sessionId: id }),

  setSession: (session) => set({ session }),

  setPlayers: (players) => set({ players }),

  setNpcs: (npcs) => set({ npcs }),

  setCurrentPlayerId: (id) => set({ currentPlayerId: id }),

  updatePlayer: (playerId, updates) =>
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, ...updates } : p,
      ),
    })),

  addFeedEntry: (entry) =>
    set((s) => ({
      feed: [...s.feed, entry],
    })),

  attachImageToLatestNarration: (imageUrl) =>
    set((s) => {
      const feed = [...s.feed];
      for (let i = feed.length - 1; i >= 0; i--) {
        const e = feed[i]!;
        if (e.type === "narration" && !e.imageUrl && !isRoundRollupNarration(e)) {
          feed[i] = { ...e, imageUrl };
          return { feed };
        }
      }
      return s;
    }),

  setSceneImage: (url) =>
    set((s) => ({
      previousSceneImage: s.sceneImage,
      sceneImage: url,
    })),

  setSceneTitle: (title) => set({ sceneTitle: title }),

  setScenePending: (pending) => set({ scenePending: pending }),

  setNarrativeText: (text) => set({ narrativeText: text }),

  setIsThinking: (thinking) => set({ isThinking: thinking }),

  showDiceOverlay: (data) => set({ diceOverlay: data }),

  hideDiceOverlay: () => set({ diceOverlay: null }),

  openSheet: (sheet) => set({ activeSheet: sheet }),

  closeSheet: () => set({ activeSheet: null }),

  setWaitingForDm: (waiting) => set({ waitingForDm: waiting }),

  setIsDm: (isDm) => set({ isDm }),

  setDmAwaiting: (value) => set({ dmAwaiting: value }),

  setDmDc: (dc) => set({ dmDc: dc }),

  setQuest: (quest) => set({ quest }),

  setRollingMemories: (memories) => set({ rollingMemories: memories }),

  addStatPopups: (popups) =>
    set((s) => ({ statPopups: [...s.statPopups, ...popups] })),

  removeStatPopup: (id) =>
    set((s) => ({ statPopups: s.statPopups.filter((p) => p.id !== id) })),

  setHpFlash: (flash) => set({ hpFlash: flash }),

  setActiveTurnId: (id) => set({ activeTurnId: id }),

  updateSessionField: (field, value) =>
    set((s) => {
      if (!s.session) return s;
      return { session: { ...s.session, [field]: value } };
    }),

  hydrate: (data) =>
    set({
      session: data.session,
      players: data.players,
      feed: data.feed ?? [],
      sceneImage: data.sceneImage ?? null,
      previousSceneImage: null,
      sceneTitle: data.sceneTitle ?? null,
      narrativeText: data.narrativeText ?? null,
      scenePending: data.scenePending ?? false,
      waitingForDm: Boolean(data.dmAwaiting),
      dmAwaiting: data.dmAwaiting ?? null,
      quest: data.quest ?? null,
      rollingMemories: data.rollingMemories ?? [],
      npcs: data.npcs ?? [],
      activeTurnId:
        data.activeTurnId === undefined ? null : data.activeTurnId,
    }),

  patchSessionFromStateApi: (data) =>
    set((s) => {
      const nextImg = data.sceneImage ?? null;
      const partyCrossfade =
        data.session?.gameKind === "party" &&
        Boolean(nextImg && s.sceneImage && nextImg !== s.sceneImage);
      return {
        ...s,
        session: data.session,
        players: data.players,
        npcs: data.npcs ?? [],
        sceneImage: nextImg,
        previousSceneImage: partyCrossfade ? s.sceneImage : null,
        sceneTitle: data.sceneTitle ?? null,
        narrativeText: data.narrativeText ?? null,
        scenePending: data.scenePending ?? false,
        waitingForDm: Boolean(data.dmAwaiting),
        dmAwaiting: data.dmAwaiting ?? null,
        quest: data.quest ?? null,
        rollingMemories: data.rollingMemories ?? [],
        activeTurnId:
          data.activeTurnId === undefined ? null : data.activeTurnId,
      };
    }),

  patchSceneHydrateFromMinimalApi: (data) =>
    set((s) => {
      if (!s.session) return s;
      const nextImg =
        data.sceneImage !== undefined ? data.sceneImage : s.sceneImage;
      const partyCrossfade =
        s.session.gameKind === "party" &&
        Boolean(
          nextImg &&
            s.sceneImage &&
            nextImg !== s.sceneImage &&
            typeof nextImg === "string",
        );
      return {
        ...s,
        session:
          data.stateVersion !== undefined
            ? { ...s.session, stateVersion: data.stateVersion }
            : s.session,
        sceneImage: nextImg ?? null,
        previousSceneImage: partyCrossfade ? s.sceneImage : s.previousSceneImage,
        sceneTitle:
          data.sceneTitle !== undefined ? data.sceneTitle : s.sceneTitle,
        narrativeText:
          data.narrativeText !== undefined
            ? data.narrativeText
            : s.narrativeText,
        scenePending:
          data.scenePending !== undefined ? data.scenePending : s.scenePending,
      };
    }),

  reset: () => set({ ...emptyState, activeTurnId: null }),
}));
