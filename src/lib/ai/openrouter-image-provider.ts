const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const IMAGE_MODEL = "google/gemini-2.5-flash-image";

interface OpenRouterImageResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      images?: Array<{
        type: string;
        image_url: { url: string };
      }>;
    };
  }>;
  error?: { message?: string; code?: number };
}

export async function generateSceneImageOpenRouter(params: {
  prompt: string;
  negativePrompt?: string;
}): Promise<{ base64: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[openrouter-image] OPENROUTER_API_KEY is not set");
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const imagePrompt = params.negativePrompt
    ? `${params.prompt}\n\nAvoid: ${params.negativePrompt}`
    : params.prompt;

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL ?? "https://playdndai.com",
      "X-Title": "Ashveil DND",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [
        {
          role: "user",
          content: imagePrompt,
        },
      ],
      modalities: ["image", "text"],
      image_config: {
        aspect_ratio: "16:9",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter Image API ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as OpenRouterImageResponse;

  if (data.error?.message) {
    throw new Error(`OpenRouter Image error: ${data.error.message}`);
  }

  const images = data.choices?.[0]?.message?.images;
  if (!images?.length) {
    throw new Error("OpenRouter returned no images");
  }

  const dataUrl = images[0]!.image_url.url;

  const base64Match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (base64Match?.[1]) {
    return { base64: base64Match[1] };
  }

  return { base64: dataUrl };
}
