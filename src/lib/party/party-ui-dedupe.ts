/**
 * Party session UI: avoid repeating the same prose in Scene (state narrative) and lower panels.
 */

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** True if `block` is already shown inside `sceneNarrative` (or is effectively the same string). */
export function isPartyBlockShownInScene(
  sceneNarrative: string | null | undefined,
  block: string | null | undefined,
): boolean {
  const s = norm(sceneNarrative ?? "");
  const b = norm(block ?? "");
  if (!s || !b) return false;
  if (s === b) return true;
  if (s.includes(b)) return true;
  if (b.length >= s.length * 0.9 && b.includes(s)) return true;
  return false;
}
