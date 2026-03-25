export interface MemoryBundle {
  canonicalState: string;
  recentEventWindow: string;
  rollingSummary: string | null;
  stylePolicy: string;
  visualBible: string | null;
}

export interface RollingSummaryContent {
  key_events: string[];
  active_hooks: string[];
  npc_relationships: string[];
  world_changes: string[];
  turn_range_start: number;
  turn_range_end: number;
}

export const STYLE_POLICY = `Narration rules:
- Maximum 120 words (hard cap 140)
- Cinematic, atmospheric prose — sounds, smells, shadows
- Always reference the acting character by name
- End with a transition to the next player
- Never invent items, abilities, or NPCs not in canonical state
- Never reveal hidden information
- Dice outcomes are authoritative — narrate around them, do not override
- Keep the tone consistent with the current game phase`;

export const TOKEN_BUDGET = {
  canonicalState: 800,
  recentEventWindow: 1200,
  rollingSummary: 600,
  stylePolicy: 200,
  visualBible: 300,
  total: 3100,
} as const;
