import * as fal from "@fal-ai/serverless-client";

const DEFAULT_NEGATIVE =
  "text, watermark, blurry, low quality, deformed, ugly";

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

type FastSdxlOut = {
  images: { url: string }[];
  seed: number;
};

export async function generateSceneImage(params: {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
}): Promise<{ imageUrl: string; seed: number }> {
  if (!process.env.FAL_KEY) {
    throw new Error("FAL_KEY is not set");
  }
  const width = params.width ?? 768;
  const height = params.height ?? 512;
  const result = (await fal.subscribe("fal-ai/fast-sdxl", {
    input: {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt ?? DEFAULT_NEGATIVE,
      image_size: { width, height },
      num_images: 1,
    },
  })) as FastSdxlOut;
  const imageUrl = result.images[0]?.url;
  if (!imageUrl) {
    throw new Error("fal.ai returned no image URL");
  }
  return { imageUrl, seed: result.seed };
}
