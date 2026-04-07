/**
 * Canonical site origin for sitemap / metadata (no trailing slash).
 * Override with `NEXT_PUBLIC_SITE_URL` / `NEXTAUTH_URL` in production as needed.
 */
export function getSiteBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "https://whatifplay.com";
}
