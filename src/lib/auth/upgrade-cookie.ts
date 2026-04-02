/**
 * Guest→Google upgrade uses a short-lived cookie. Without an explicit Domain,
 * the cookie is host-only — so `playromana.com` and `www.playromana.com` each
 * get a separate cookie and OAuth callbacks on the "wrong" host lose context.
 * Derive `.parent.com` from NEXTAUTH_URL in production so apex + www share it.
 */
export const UPGRADE_COOKIE_NAME = "falvos.upgrade_guest_id";

const UPGRADE_MAX_AGE_SEC = 60 * 15;

function parentSiteCookieDomain(): string | undefined {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (!raw) return undefined;
  try {
    const hostname = new URL(raw).hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1"
    ) {
      return undefined;
    }
    if (hostname.endsWith(".vercel.app")) {
      return undefined;
    }
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length < 2) return undefined;
    return `.${parts.slice(-2).join(".")}`;
  } catch {
    return undefined;
  }
}

type UpgradeCookieOpts = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
  domain?: string;
};

function upgradeCookieBase(maxAge: number): UpgradeCookieOpts {
  const domain = parentSiteCookieDomain();
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
    ...(domain ? { domain } : {}),
  };
}

/** Options for Set-Cookie when starting an upgrade (15m TTL). */
export function upgradeCookieAssignOptions(): UpgradeCookieOpts {
  return upgradeCookieBase(UPGRADE_MAX_AGE_SEC);
}

/** Options for Set-Cookie when clearing after upgrade (must match assign domain/path). */
export function upgradeCookieDeleteOptions(): UpgradeCookieOpts {
  return upgradeCookieBase(0);
}
