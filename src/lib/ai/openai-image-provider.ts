import OpenAI from "openai";

const DEFAULT_IMAGE_MODEL = "gpt-image-1";

function resolveModelId(): string {
  const configured = process.env.OPENAI_IMAGE_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_IMAGE_MODEL;
}

export async function generateSceneImageOpenAI(params: {
  prompt: string;
  negativePrompt?: string;
}): Promise<{ base64: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const client = new OpenAI({ apiKey });
  const prompt = params.negativePrompt?.trim()
    ? `${params.prompt}\n\nAvoid: ${params.negativePrompt}`
    : params.prompt;

  const result = await client.images.generate({
    model: resolveModelId(),
    prompt,
    size: "1536x1024",
  });

  const base64 = result.data?.[0]?.b64_json;
  if (!base64?.trim()) {
    throw new Error("OpenAI Images API returned no base64 image payload");
  }

  return { base64 };
}
