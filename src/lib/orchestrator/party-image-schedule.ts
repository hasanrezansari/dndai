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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secret = process.env.INTERNAL_API_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        narrative_text: params.mergedBeat,
        round_index: params.roundIndex,
      }),
    });
    console.log("[party-image] scheduled, status:", res.status);
  } catch (err) {
    console.error("[party-image] schedule fetch failed:", err);
  }
}
