import type { NextRequest } from "next/server";

const PREFIX = "[ashveil-auth]";

/** Set to `1` or `true` in Vercel for extra Auth.js debug lines (adapter + flow). */
export function isAuthLogVerbose(): boolean {
  const v = process.env.AUTH_LOG_VERBOSE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function safeJson(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return JSON.stringify({ serializeError: true });
  }
}

export function authServerLog(
  kind: string,
  payload: Record<string, unknown>,
): void {
  console.log(PREFIX, safeJson({ t: new Date().toISOString(), kind, ...payload }));
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/**
 * Incoming `/api/auth/*` request (no cookies, no secrets).
 */
export function logAuthHttpRequest(req: NextRequest): void {
  const url = req.nextUrl;
  const segments = url.pathname.split("/").filter(Boolean);
  const action = segments.slice(2).join("/") || "(root)";
  const q = url.searchParams;
  const error = q.get("error");
  const callbackUrl = q.get("callbackUrl");

  authServerLog("http_request", {
    method: req.method,
    action,
    host:
      req.headers.get("x-forwarded-host") ??
      req.headers.get("host") ??
      "(unknown)",
    queryError: error ?? undefined,
    queryCallbackUrl: callbackUrl ? truncate(callbackUrl, 120) : undefined,
    googleClientIdConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim().length,
    ),
    googleClientSecretConfigured: Boolean(
      process.env.GOOGLE_CLIENT_SECRET?.trim().length,
    ),
    nextAuthUrlHost: (() => {
      const raw = process.env.NEXTAUTH_URL?.trim();
      if (!raw) return "(unset)";
      try {
        return new URL(raw).host;
      } catch {
        return "(invalid NEXTAUTH_URL)";
      }
    })(),
  });
}

/**
 * Outgoing auth handler response (status + redirect target if any).
 */
export function logAuthHttpResponse(req: NextRequest, res: Response): void {
  const loc = res.headers.get("location");
  let redirectPath: string | undefined;
  let redirectError: string | undefined;
  if (loc) {
    try {
      const u = new URL(loc, req.nextUrl.origin);
      redirectPath = truncate(u.pathname + u.search, 200);
      redirectError = u.searchParams.get("error") ?? undefined;
    } catch {
      redirectPath = truncate(loc, 200);
    }
  }
  authServerLog("http_response", {
    method: req.method,
    status: res.status,
    redirectError: redirectError ?? undefined,
    redirect: redirectPath,
  });
}
