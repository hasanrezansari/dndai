export const JOIN_CODE_ALPHABET =
  "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function normalizeJoinCodeForLookup(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Strict format check for public watch-by-code and lobby-style entry. */
export function isValidJoinCodeFormat(code: string): boolean {
  const c = normalizeJoinCodeForLookup(code);
  if (c.length !== 6) return false;
  for (let i = 0; i < c.length; i++) {
    if (!JOIN_CODE_ALPHABET.includes(c[i]!)) return false;
  }
  return true;
}
