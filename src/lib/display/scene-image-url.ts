/**
 * Room display only: append display JWT so `<img src>` can authorize scene-image GET.
 */
export function withDisplaySceneImageUrl(
  url: string | null,
  sessionId: string,
  displayToken: string | null,
): string | null {
  if (!url?.trim() || !displayToken?.trim()) return url;
  const prefix = `/api/sessions/${sessionId}/scene-image/`;
  if (!url.startsWith(prefix)) return url;
  try {
    const u = new URL(url, "https://ashveil.local");
    u.searchParams.set("t", displayToken.trim());
    return u.pathname + u.search;
  } catch {
    const base = url.split("?")[0]!;
    return `${base}?t=${encodeURIComponent(displayToken.trim())}`;
  }
}
