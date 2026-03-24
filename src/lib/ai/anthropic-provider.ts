import Anthropic from "@anthropic-ai/sdk";

import type { AIProvider, ModelTier, TokenUsage, ZodSchema } from "@/lib/ai/types";

const MODEL_MAP = {
  heavy: "claude-sonnet-4-20250514",
  light: "claude-haiku-4-20250414",
} as const;

const DEFAULT_TIMEOUT_MS = 30_000;

function extractJsonObject(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence?.[1]) return fence[1].trim();
  return t;
}

function textFromMessage(msg: Anthropic.Messages.Message): string {
  const parts: string[] = [];
  for (const b of msg.content) {
    if (b.type === "text") parts.push(b.text);
  }
  return parts.join("\n");
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  private modelName(tier: ModelTier): string {
    return MODEL_MAP[tier];
  }

  private usageFrom(model: string, msg: Anthropic.Messages.Message): TokenUsage {
    return {
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      model,
    };
  }

  async generateStructured<T>(params: {
    model: ModelTier;
    systemPrompt: string;
    userPrompt: string;
    schema: ZodSchema<T>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ data: T; usage: TokenUsage }> {
    const model = this.modelName(params.model);
    const client = this.getClient();
    const system = `${params.systemPrompt}\n\nRespond with only a single JSON object. No markdown fences, no commentary.`;

    const run = async (userContent: string): Promise<{ parsed: unknown; usage: TokenUsage }> => {
      const msg = await client.messages.create(
        {
          model,
          max_tokens: params.maxTokens ?? 4096,
          temperature: params.temperature ?? 0.7,
          system,
          messages: [{ role: "user", content: userContent }],
        },
        { timeout: DEFAULT_TIMEOUT_MS },
      );
      const text = textFromMessage(msg);
      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJsonObject(text));
      } catch {
        throw new SyntaxError("Invalid JSON from model");
      }
      return { parsed, usage: this.usageFrom(model, msg) };
    };

    let userContent = params.userPrompt;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { parsed, usage } = await run(userContent);
        const validated = params.schema.safeParse(parsed);
        if (validated.success) {
          return { data: validated.data, usage };
        }
        lastErr = validated.error;
      } catch (e) {
        lastErr = e;
      }
      userContent = `${params.userPrompt}\n\nRespond ONLY with valid JSON matching the schema. No markdown, no prose.`;
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async generateText(params: {
    model: ModelTier;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ text: string; usage: TokenUsage }> {
    const model = this.modelName(params.model);
    const client = this.getClient();
    const msg = await client.messages.create(
      {
        model,
        max_tokens: params.maxTokens ?? 4096,
        temperature: params.temperature ?? 0.7,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
      },
      { timeout: DEFAULT_TIMEOUT_MS },
    );
    return {
      text: textFromMessage(msg),
      usage: this.usageFrom(model, msg),
    };
  }
}
