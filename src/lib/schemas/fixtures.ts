import type {
  Action,
  Character,
  DiceRoll,
  NarrativeEvent,
  Player,
  SceneSnapshot,
  Session,
  Turn,
} from "./domain";

export function createMockSession(overrides: Partial<Session> = {}): Session {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    mode: "ai_dm",
    campaign_mode: "user_prompt",
    status: "lobby",
    max_players: 4,
    current_round: 1,
    current_turn_index: 0,
    current_player_id: null,
    phase: "exploration",
    join_code: "ABC123",
    host_user_id: crypto.randomUUID(),
    state_version: 0,
    adventure_prompt: null,
    module_key: null,
    campaign_title: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createMockPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    character_id: null,
    seat_index: 0,
    is_ready: false,
    is_connected: true,
    is_host: true,
    is_dm: false,
    joined_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockCharacter(overrides: Partial<Character> = {}): Character {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    player_id: crypto.randomUUID(),
    name: "Aldric",
    class: "Fighter",
    race: "Human",
    level: 1,
    stats: {
      str: 14,
      dex: 12,
      con: 15,
      int: 10,
      wis: 13,
      cha: 11,
    },
    hp: 12,
    max_hp: 12,
    ac: 16,
    mana: 0,
    max_mana: 0,
    inventory: [],
    abilities: [],
    conditions: [],
    visual_profile: {},
    created_at: now,
    ...overrides,
  };
}

export function createMockTurn(overrides: Partial<Turn> = {}): Turn {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    round_number: 1,
    player_id: crypto.randomUUID(),
    phase: "exploration",
    status: "awaiting_input",
    started_at: now,
    resolved_at: null,
    ...overrides,
  };
}

export function createMockAction(overrides: Partial<Action> = {}): Action {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    turn_id: crypto.randomUUID(),
    raw_input: "I search the room.",
    parsed_intent: {},
    resolution_status: "pending",
    created_at: now,
    ...overrides,
  };
}

export function createMockDiceRoll(overrides: Partial<DiceRoll> = {}): DiceRoll {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    action_id: crypto.randomUUID(),
    roll_type: "d20",
    context: "perception_check",
    roll_value: 14,
    modifier: 2,
    total: 16,
    advantage_state: "none",
    result: "success",
    created_at: now,
    ...overrides,
  };
}

export function createMockNarrativeEvent(
  overrides: Partial<NarrativeEvent> = {},
): NarrativeEvent {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    turn_id: null,
    scene_text:
      "The corridor stretches ahead, torchlight wavering on damp stone. Something stirs in the dark.",
    visible_changes: ["Torchlight flickers.", "Distant drip echoes."],
    tone: "tense",
    next_actor_id: null,
    image_hint: {
      subjects: [],
      avoid: [],
    },
    created_at: now,
    ...overrides,
  };
}

export function createMockSceneSnapshot(
  overrides: Partial<SceneSnapshot> = {},
): SceneSnapshot {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    round_number: 1,
    state_version: 0,
    summary: "A narrow crypt passage.",
    image_status: "none",
    image_prompt: null,
    image_url: null,
    created_at: now,
    ...overrides,
  };
}
