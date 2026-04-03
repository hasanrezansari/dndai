/**
 * Client-safe main app origin (playdndai) for links from PlayRomana builds.
 * Set `NEXT_PUBLIC_MAIN_APP_ORIGIN` on the Romana deployment when it differs from default.
 */
export function getMainAppPublicOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_MAIN_APP_ORIGIN?.trim().replace(/\/$/, "") ??
    "https://playdndai.com"
  );
}
