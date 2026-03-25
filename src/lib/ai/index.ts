import type { AIProvider } from "@/lib/ai/types";

import { AnthropicProvider } from "@/lib/ai/anthropic-provider";
import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { MockProvider } from "@/lib/ai/mock-provider";
import { OpenAIProvider } from "@/lib/ai/openai-provider";
import { OpenRouterProvider } from "@/lib/ai/openrouter-provider";

export * from "@/lib/ai/types";
export { AnthropicProvider } from "@/lib/ai/anthropic-provider";
export { GeminiProvider } from "@/lib/ai/gemini-provider";
export { MockProvider } from "@/lib/ai/mock-provider";
export { OpenAIProvider } from "@/lib/ai/openai-provider";
export { OpenRouterProvider } from "@/lib/ai/openrouter-provider";

export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "openai";
  switch (provider) {
    case "anthropic":
      return new AnthropicProvider();
    case "gemini":
      return new GeminiProvider();
    case "openrouter":
      return new OpenRouterProvider();
    case "mock":
      return new MockProvider();
    default:
      return new OpenAIProvider();
  }
}
