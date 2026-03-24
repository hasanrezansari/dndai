import type { z } from "zod";

export type ModelTier = "heavy" | "light";

export type ZodSchema<T> = z.ZodType<T>;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface AIProvider {
  generateStructured<T>(params: {
    model: ModelTier;
    systemPrompt: string;
    userPrompt: string;
    schema: ZodSchema<T>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ data: T; usage: TokenUsage }>;

  generateText(params: {
    model: ModelTier;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ text: string; usage: TokenUsage }>;
}

export interface OrchestrationStepResult<T> {
  data: T;
  usage: TokenUsage;
  latencyMs: number;
  success: boolean;
  error?: string;
}
