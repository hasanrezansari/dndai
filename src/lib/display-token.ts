import { SignJWT, jwtVerify } from "jose";

export const DISPLAY_TOKEN_AUDIENCE = "ashveil-display";

const DISPLAY_TOKEN_TTL_SEC = 60 * 60 * 24; // 24h

function getSecretKey(): Uint8Array {
  const raw =
    process.env.DISPLAY_TOKEN_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!raw) {
    throw new Error("DISPLAY_TOKEN_SECRET or NEXTAUTH_SECRET is required");
  }
  return new TextEncoder().encode(raw);
}

function tryGetSecretKey(): Uint8Array | null {
  const raw =
    process.env.DISPLAY_TOKEN_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

export async function signDisplayToken(sessionId: string): Promise<{
  token: string;
  expiresAtIso: string;
}> {
  const exp = Math.floor(Date.now() / 1000) + DISPLAY_TOKEN_TTL_SEC;
  const expiresAtIso = new Date(exp * 1000).toISOString();
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sessionId)
    .setAudience(DISPLAY_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getSecretKey());
  return { token, expiresAtIso };
}

/** @returns sessionId from JWT sub if valid */
export async function verifyDisplayToken(
  token: string,
): Promise<{ sessionId: string } | null> {
  try {
    const secret = tryGetSecretKey();
    if (!secret) return null;
    const { payload } = await jwtVerify(token, secret, {
      audience: DISPLAY_TOKEN_AUDIENCE,
      algorithms: ["HS256"],
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub) return null;
    return { sessionId: sub };
  } catch {
    return null;
  }
}
