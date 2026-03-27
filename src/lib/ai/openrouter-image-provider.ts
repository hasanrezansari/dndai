const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const PRIMARY_IMAGE_MODEL = "google/gemini-2.5-flash-image";
const FALLBACK_IMAGE_MODEL =
  process.env.OPENROUTER_IMAGE_FALLBACK_MODEL ??
  "google/gemini-2.0-flash-exp:free";

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

function truncateForLog(value: string, max = 500): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

function parseDataUrlBase64(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:image\/[\w+.-]+;base64,(.+)$/);
  return match?.[1] ?? null;
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Image fetch failed ${res.status} for ${url}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr).toString("base64");
}

async function requestOpenRouterImage(params: {
  apiKey: string;
  model: string;
  userContent: string;
}): Promise<{ base64: string }> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL ?? "https://playdndai.com",
      "X-Title": "Ashveil DND",
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        {
          role: "system",
          content:
            "You are a fantasy illustrator. Generate a single wide scene image in a consistent dark-fantasy oil-painting style with muted earth tones, amber torchlight, and deep shadows. Keep character designs and environment consistent across scenes. No text, no UI, no watermarks.",
        },
        {
          role: "user",
          content: params.userContent,
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
    const requestId =
      res.headers.get("x-request-id") ??
      res.headers.get("x-openrouter-request-id") ??
      "unknown";
    console.error("[openrouter-image] non-200 response", {
      status: res.status,
      requestId,
      model: params.model,
      body: truncateForLog(errText),
    });
    throw new Error(`OpenRouter Image API ${res.status}: ${truncateForLog(errText, 240)}`);
  }

  const data = (await res.json()) as OpenRouterImageResponse;

  if (data.error?.message) {
    console.error("[openrouter-image] api error payload", {
      model: params.model,
      code: data.error.code ?? null,
      message: truncateForLog(data.error.message),
    });
    throw new Error(`OpenRouter Image error: ${data.error.message}`);
  }

  const images = data.choices?.[0]?.message?.images;
  if (!images?.length) {
    const content = data.choices?.[0]?.message?.content ?? "";
    console.error("[openrouter-image] no images in response", {
      model: params.model,
      contentPreview: truncateForLog(content, 240),
    });
    throw new Error("OpenRouter returned no images");
  }

  const dataUrl = images[0]!.image_url.url;

  const inlineBase64 = parseDataUrlBase64(dataUrl);
  if (inlineBase64) {
    return { base64: inlineBase64 };
  }

  if (/^https?:\/\//i.test(dataUrl)) {
    const fetchedBase64 = await fetchImageAsBase64(dataUrl);
    return { base64: fetchedBase64 };
  }

  return { base64: dataUrl };
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

  const userContent = params.negativePrompt
    ? `${params.prompt}\n\nAvoid: ${params.negativePrompt}`
    : params.prompt;

  const primary =
    process.env.OPENROUTER_IMAGE_MODEL?.trim() || PRIMARY_IMAGE_MODEL;
  const models = [primary, FALLBACK_IMAGE_MODEL].filter(
    (m, i, a) => m.length > 0 && a.indexOf(m) === i,
  );

  let lastErr: Error | null = null;
  for (const model of models) {
    try {
      return await requestOpenRouterImage({ apiKey, model, userContent });
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (model !== models[models.length - 1]) {
        console.warn("[openrouter-image] retrying with fallback model", {
          failed: model,
          next: models[models.indexOf(model) + 1],
        });
      }
    }
  }
  throw lastErr ?? new Error("OpenRouter image generation failed");
}
