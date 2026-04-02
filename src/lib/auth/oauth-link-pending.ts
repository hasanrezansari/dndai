/**
 * While opening Google after signOut (guest→Google upgrade or Create account),
 * the session cookie is cleared before OAuth. AuthGate uses this flag to avoid
 * flashing Play as guest / PlayRomana auto-guest during that gap.
 *
 * We mirror to localStorage as well: some browsers or privacy modes block or
 * isolate sessionStorage inconsistently across redirects, which used to expose
 * the full entry card mid-flow and made it easy to end up back on a guest session.
 */
const KEY = "ashveil.oauth_link_pending";
const MAX_MS = 5 * 60 * 1000;

function writeBoth(value: string | null): void {
  try {
    if (value === null) {
      sessionStorage.removeItem(KEY);
    } else {
      sessionStorage.setItem(KEY, value);
    }
  } catch {
    /* ignore */
  }
  try {
    if (value === null) {
      localStorage.removeItem(KEY);
    } else {
      localStorage.setItem(KEY, value);
    }
  } catch {
    /* ignore */
  }
}

export function setOauthLinkPending(): void {
  writeBoth(String(Date.now()));
}

export function clearOauthLinkPending(): void {
  writeBoth(null);
}

export function isOauthLinkPending(): boolean {
  if (typeof window === "undefined") return false;
  const read = (): string | null => {
    try {
      return sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
    } catch {
      try {
        return localStorage.getItem(KEY);
      } catch {
        return null;
      }
    }
  };
  const raw = read();
  if (!raw) return false;
  const t = Number.parseInt(raw, 10);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < MAX_MS;
}
