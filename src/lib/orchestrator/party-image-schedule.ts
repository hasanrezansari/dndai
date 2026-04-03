import { getInternalBearerSecrets } from "@/lib/auth/guards";

function resolveAppOrigin(): string | null {
  const internal = process.env.INTERNAL_APP_URL?.replace(/\/$/, "");
  if (internal) return internal;
  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;
  const nextAuth = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (nextAuth && !nextAuth.includes("localhost")) return nextAuth;
  return null;
}

/** Fire-and-forget: generates party round art and patches `party_config.scene_image_url`. */
export async function schedulePartyRoundSceneImage(params: {
  sessionId: string;
  mergedBeat: string;
  roundIndex: number;
}): Promise<void> {
  const origin = resolveAppOrigin();
  if (!origin) {
    console.error(
      "[party-image] missing app origin — cannot schedule scene image",
    );
    return;
  }
  const url = `${origin}/api/sessions/${params.sessionId}/party/scene-image`;
  const body = JSON.stringify({
    narrative_text: params.mergedBeat,
    round_index: params.roundIndex,
  });
  const secrets = getInternalBearerSecrets();
  if (secrets.length === 0) {
    console.error(
      "[party-image] missing INTERNAL_API_SECRET / NEXTAUTH_SECRET — cannot authorize scene-image",
    );
    return;
  }
  try {
    let res: Response | null = null;
    for (let i = 0; i < secrets.length; i++) {
      const secret = secrets[i]!;
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body,
      });
      if (res.status !== 401) break;
    }
    console.log("[party-image] scheduled, status:", res?.status);
    if (res?.status === 401) {
      console.error(
        "[party-image] 401 after trying all secrets — align INTERNAL_API_SECRET and NEXTAUTH_SECRET in Vercel (or remove a bad INTERNAL_API_SECRET)",
      );
    }
  } catch (err) {
    console.error("[party-image] schedule fetch failed:", err);
  }
}
