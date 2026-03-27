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
}): string {
  const progressPart = isQuestFinaleThreshold(quest)
    ? "finale threshold (party may vote to end or continue)"
    : `${quest.progress}%`;
  return `Quest: ${quest.objective} | Progress ${progressPart} | Danger ${quest.risk}% | ${quest.status}`;
}
