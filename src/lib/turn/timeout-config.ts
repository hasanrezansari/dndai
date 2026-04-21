export const TURN_TIMEOUT_SEC = 120;
/** Seconds after turn start before the action-window countdown and urgency styling apply. */
export const TURN_READING_GRACE_SEC = 120;
export const TURN_DISCONNECT_GRACE_SEC = 90;
export const TURN_AWAY_STREAK_THRESHOLD = 2;
/** UI soft warning when remaining time is at or below this many seconds. */
export const TURN_SOFT_WARN_SEC = 30;
/** Seconds added per "Need more time" use (capped per chapter per player). */
export const TURN_EXTENSION_SEC = 30;
export const MAX_TURN_EXTENSIONS_PER_CHAPTER = 2;

/** Total seconds from turn start until auto-resolve (reading grace + action window). */
export function turnAwaitingInputTotalSec(): number {
  return TURN_READING_GRACE_SEC + TURN_TIMEOUT_SEC;
}

export function turnDeadlineFromNow(seconds: number): Date {
  return new Date(Date.now() + Math.max(1, seconds) * 1000);
}
