/**
 * Client-safe main app origin for links from PlayRomana builds.
 * Defaults to whatifplay.com; override with `NEXT_PUBLIC_MAIN_APP_ORIGIN` on Romana if needed.
 */
export function getMainAppPublicOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_MAIN_APP_ORIGIN?.trim().replace(/\/$/, "") ??
    "https://whatifplay.com"
  );
}
