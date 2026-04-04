/**
 * Canonical site origin for sitemap / metadata (no trailing slash).
 * For production cutover to whatifplay.com: set `NEXT_PUBLIC_SITE_URL` and
 * `NEXTAUTH_URL` to `https://whatifplay.com` (no code change required).
 */
export function getSiteBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "https://playdndai.com";
}
