import type { AIProvider, ModelTier, TokenUsage, ZodSchema } from "@/lib/ai/types";

export class FallbackProvider implements AIProvider {
  private providers: Array<{ name: string; provider: AIProvider }>;

  constructor(providers: Array<{ name: string; provider: AIProvider }>) {
    if (providers.length === 0) {
      throw new Error("FallbackProvider requires at least one provider");
    }
    this.providers = providers;
  }

  async generateStructured<T>(params: {
    model: ModelTier;
    systemPrompt: string;
    userPrompt: string;
    schema: ZodSchema<T>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ data: T; usage: TokenUsage }> {
    let lastError: unknown;

    for (const { name, provider } of this.providers) {
      try {
        return await provider.generateStructured(params);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isRateLimit =
          msg.includes("429") ||
          msg.includes("quota") ||
          msg.includes("rate") ||
          msg.includes("RESOURCE_EXHAUSTED");
        console.warn(
          `[fallback-provider] ${name} failed${isRateLimit ? " (rate limited)" : ""}: ${msg.slice(0, 120)}`,
        );
        lastError = e;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async generateText(params: {
    model: ModelTier;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ text: string; usage: TokenUsage }> {
    let lastError: unknown;

    for (const { name, provider } of this.providers) {
      try {
        return await provider.generateText(params);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          `[fallback-provider] ${name} generateText failed: ${msg.slice(0, 120)}`,
        );
        lastError = e;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
