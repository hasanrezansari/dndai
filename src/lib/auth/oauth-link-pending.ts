/**
 * While guest→Google runs we call signOut() before signIn("google").
 * Session becomes unauthenticated briefly; AuthGate uses this flag to avoid
 * flashing the Play as guest / Create account screen.
 */
const KEY = "ashveil.oauth_link_pending";
const MAX_MS = 5 * 60 * 1000;

export function setOauthLinkPending(): void {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearOauthLinkPending(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function isOauthLinkPending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const t = Number.parseInt(raw, 10);
    if (Number.isNaN(t)) return false;
    return Date.now() - t < MAX_MS;
  } catch {
    return false;
  }
}
