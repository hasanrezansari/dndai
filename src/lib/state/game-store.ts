import { create } from "zustand";

import type { CharacterStats } from "@/lib/schemas/domain";

export type ActiveSheet = "character" | "party" | "journal";

export interface FeedEntry {
  id: string;
  type: "action" | "dice" | "narration" | "state_change" | "system";
  playerName?: string;
  text: string;
  detail?: string;
  timestamp: string;
  highlight?: boolean;
  imageUrl?: string;
}

export interface GameSessionView {
  status: string;
  mode: string;
  phase: string;
  currentRound: number;
  currentTurnIndex: number;
  currentPlayerId: string | null;
  campaignTitle: string | null;
  stateVersion: number;
  finalChapterPublished?: boolean;
}

export interface QuestProgressView {
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
    class: string;
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
  };
}

export interface DiceOverlayData {
  context: string;
  diceType: string;
  rollValue: number;
  modifier: number;
  total: number;
  result: string;
}

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

  setSessionId: (id: string) => void;
  setSession: (session: GameState["session"]) => void;
  setPlayers: (players: GameState["players"]) => void;
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
  hydrate: (data: {
    session: GameSessionView;
    players: GamePlayerView[];
    feed?: FeedEntry[];
    sceneImage?: string | null;
    sceneTitle?: string | null;
    narrativeText?: string | null;
    scenePending?: boolean;
    dmAwaiting?: { turnId: string; actingPlayerId: string } | null;
    quest?: QuestProgressView | null;
  }) => void;
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
};

export const useGameStore = create<GameState>((set) => ({
  ...emptyState,

  setSessionId: (id) => set({ sessionId: id }),

  setSession: (session) => set({ session }),

  setPlayers: (players) => set({ players }),

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
        if (feed[i]!.type === "narration" && !feed[i]!.imageUrl) {
          feed[i] = { ...feed[i]!, imageUrl };
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
    }),

  reset: () => set({ ...emptyState }),
}));
