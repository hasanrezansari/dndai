/** Five beats for UI + world-shift lines (20% bands up to finale). */
export const QUEST_MILESTONE_LABELS = [
  "Trail holds — clues compound",
  "Mid-chapter push — stakes sharpen",
  "Turning point — costs rise",
  "Endgame pressure — loose ends tighten",
  "Finale threshold — resolve or vote",
] as const;

export function questMilestoneStep(progress: number): number {
  const p = Math.max(0, Math.min(100, progress));
  if (p >= 100) return 5;
  if (p >= 80) return 4;
  if (p >= 60) return 3;
  if (p >= 40) return 2;
  if (p >= 20) return 1;
  return 0;
}

/** Finale / vote state — progress hit the story threshold, not “game over.” */
export function isQuestFinaleThreshold(quest: {
  status: string;
  progress: number;
}): boolean {
  return (
    quest.status === "ready_to_end" ||
    (quest.status === "active" && quest.progress >= 100)
  );
}

/**
 * Bar width 0–100: stays high but not a full “100% complete” fill during finale
 * so the meter doesn’t contradict “adventure still ongoing until the table votes.”
 */
export function questProgressBarWidth(quest: {
  progress: number;
  status: string;
}): number {
  if (quest.status === "failed") {
    return Math.max(0, Math.min(100, quest.progress));
  }
  if (quest.status === "ready_to_end" || quest.progress >= 100) {
    return 94;
  }
  return Math.max(0, Math.min(100, quest.progress));
}

/** Primary progress label: no literal “100%” at finale threshold. */
export function questProgressPrimaryLine(quest: {
  progress: number;
  status: string;
}): string {
  if (quest.status === "failed") return `${quest.progress}%`;
  if (isQuestFinaleThreshold(quest)) return "Finale arc";
  return `${quest.progress}%`;
}

/** Quest line for AI / memory context (no misleading “100% complete”). */
export function questProgressForModel(quest: {
  objective: string;
  progress: number;
  risk: number;
  status: string;
  betrayal?: {
    phase?: string;
    outcome_id?: string;
    instigator_player_id?: string | null;
    traitor_player_id?: string | null;
    macguffin_holder_player_id?: string | null;
  };
}): string {
  const progressPart = isQuestFinaleThreshold(quest)
    ? "finale threshold (party may vote to end or continue)"
    : `${quest.progress}%`;
  const base = `Quest: ${quest.objective} | Progress ${progressPart} | Danger ${quest.risk}% | ${quest.status}`;
  const b = quest.betrayal;
  if (!b || b.phase === "idle") return base;
  const oid = b.outcome_id ? `outcome=${b.outcome_id}` : "";
  const inst = b.instigator_player_id ? `instigator=${b.instigator_player_id}` : "";
  const traitor = b.traitor_player_id ? `traitor_player=${b.traitor_player_id}` : "";
  const holder = b.macguffin_holder_player_id
    ? `macguffin_holder=${b.macguffin_holder_player_id}`
    : "";
  const extra = [oid, inst, traitor, holder].filter(Boolean).join("; ");
  return extra
    ? `${base} | Betrayal spine: phase=${b.phase}; ${extra}`
    : `${base} | Betrayal spine: phase=${b.phase}`;
}
