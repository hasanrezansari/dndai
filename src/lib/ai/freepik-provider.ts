const API_URL = "https://api.freepik.com/v1/ai/text-to-image";
const DEFAULT_NEGATIVE = "text, watermark, blurry, low quality, deformed, ugly, UI elements";

export async function generateSceneImageFreepik(params: {
  prompt: string;
  negativePrompt?: string;
}): Promise<{ base64: string; seed: number }> {
  const apiKey = process.env.FREEPIK_API_KEY;
  if (!apiKey) {
    console.error("[freepik] FREEPIK_API_KEY is not set");
    throw new Error("FREEPIK_API_KEY is not set");
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-freepik-api-key": apiKey,
    },
    body: JSON.stringify({
      prompt: params.prompt,
      negative_prompt: params.negativePrompt ?? DEFAULT_NEGATIVE,
      num_images: 1,
      image: { size: "widescreen_16_9" },
      guidance_scale: 1.5,
      styling: {
        style: "fantasy",
        effects: {
          lightning: "cinematic",
          color: "dramatic",
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Freepik API ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    data: Array<{ base64: string; has_nsfw: boolean }>;
    meta: { seed: number };
  };

  const img = data.data[0];
  if (!img?.base64) {
    throw new Error("Freepik returned no image data");
  }

  return { base64: img.base64, seed: data.meta.seed ?? 0 };
}
