export type SessionUiMode = "spotlight" | "classic" | "chronicle";

export const SESSION_UI_MODE_STORAGE_KEY = "ashveil.sessionUiMode";

export const DEFAULT_SESSION_UI_MODE: SessionUiMode = "chronicle";

export function parseSessionUiMode(raw: string | null): SessionUiMode {
  if (raw === "classic") return "classic";
  if (raw === "chronicle") return "chronicle";
  if (raw === "spotlight") return "spotlight";
  return DEFAULT_SESSION_UI_MODE;
}

export function readSessionUiModeFromStorage(): SessionUiMode {
  if (typeof window === "undefined") return DEFAULT_SESSION_UI_MODE;
  try {
    return parseSessionUiMode(localStorage.getItem(SESSION_UI_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_SESSION_UI_MODE;
  }
}

export function writeSessionUiModeToStorage(mode: SessionUiMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_UI_MODE_STORAGE_KEY, mode);
  } catch {
    /* quota / private mode */
  }
}
