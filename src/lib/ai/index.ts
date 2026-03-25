import type { AIProvider } from "@/lib/ai/types";

import { AnthropicProvider } from "@/lib/ai/anthropic-provider";
import { FallbackProvider } from "@/lib/ai/fallback-provider";
import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { MockProvider } from "@/lib/ai/mock-provider";
import { OpenAIProvider } from "@/lib/ai/openai-provider";
import { OpenRouterProvider } from "@/lib/ai/openrouter-provider";

export * from "@/lib/ai/types";
export { AnthropicProvider } from "@/lib/ai/anthropic-provider";
export { FallbackProvider } from "@/lib/ai/fallback-provider";
export { GeminiProvider } from "@/lib/ai/gemini-provider";
export { MockProvider } from "@/lib/ai/mock-provider";
export { OpenAIProvider } from "@/lib/ai/openai-provider";
export { OpenRouterProvider } from "@/lib/ai/openrouter-provider";

function getSingleProvider(name: string): AIProvider {
  switch (name) {
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

function buildFallbackChain(primary: string): Array<{ name: string; provider: AIProvider }> {
  const added = new Set<string>();
  const chain: Array<{ name: string; provider: AIProvider }> = [];

  function add(name: string) {
    if (added.has(name)) return;
    added.add(name);
    chain.push({ name, provider: getSingleProvider(name) });
  }

  // OpenRouter's free router (27 models, auto-routing) is the most
  // reliable free option, so always try it first when available.
  if (process.env.OPENROUTER_API_KEY) add("openrouter");

  add(primary);

  const keyToProvider: Array<[string, string]> = [
    ["GEMINI_API_KEY", "gemini"],
    ["OPENAI_API_KEY", "openai"],
    ["ANTHROPIC_API_KEY", "anthropic"],
  ];

  for (const [envKey, providerName] of keyToProvider) {
    if (process.env[envKey]) add(providerName);
  }

  return chain;
}

export function getAIProvider(): AIProvider {
  const primary = process.env.AI_PROVIDER ?? "openai";
  if (primary === "mock") {
    return new MockProvider();
  }

  const chain = buildFallbackChain(primary);
  if (chain.length === 1) {
    return chain[0]!.provider;
  }

  return new FallbackProvider(chain);
}
