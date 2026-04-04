/**
 * Client-safe main app origin for links from PlayRomana builds.
 * Defaults to playdndai.com; when the main app moves to whatifplay.com, set
 * `NEXT_PUBLIC_MAIN_APP_ORIGIN=https://whatifplay.com` on the Romana deployment.
 */
export function getMainAppPublicOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_MAIN_APP_ORIGIN?.trim().replace(/\/$/, "") ??
    "https://playdndai.com"
  );
}
