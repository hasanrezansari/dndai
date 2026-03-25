import type { AIProvider, ModelTier, TokenUsage, ZodSchema } from "@/lib/ai/types";

const MODEL_MAP = {
  heavy: "openrouter/free",
  light: "openrouter/free",
} as const;

const DEFAULT_TIMEOUT_MS = 20_000;
const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

function extractJsonObject(raw: string): string {
  const t = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fence?.[1]) return fence[1].trim();
  const braceStart = t.indexOf("{");
  const braceEnd = t.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return t.slice(braceStart, braceEnd + 1);
  }
  return t;
}

export class OpenRouterProvider implements AIProvider {
  private apiKey(): string {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY is not set");
    return key;
  }

  private modelName(tier: ModelTier): string {
    return MODEL_MAP[tier];
  }

  private usageFrom(model: string, usage?: { prompt_tokens?: number; completion_tokens?: number }): TokenUsage {
    return {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
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
    const system = `${params.systemPrompt}\n\nRespond with only a single JSON object. No markdown fences, no commentary.`;

    let userContent = params.userPrompt;
    let lastErr: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.callOpenRouter(model, [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ], {
          max_tokens: params.maxTokens ?? 4096,
          temperature: params.temperature ?? 0.7,
        });

        const text = response.choices?.[0]?.message?.content ?? "";
        let parsed: unknown;
        try {
          parsed = JSON.parse(extractJsonObject(text));
        } catch {
          throw new SyntaxError("Invalid JSON from model");
        }

        const validated = params.schema.safeParse(parsed);
        if (validated.success) {
          return { data: validated.data, usage: this.usageFrom(model, response.usage) };
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

    const response = await this.callOpenRouter(model, [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ], {
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.7,
    });

    return {
      text: response.choices?.[0]?.message?.content ?? "",
      usage: this.usageFrom(model, response.usage),
    };
  }

  private async callOpenRouter(
    model: string,
    messages: Array<{ role: string; content: string }>,
    config: { max_tokens?: number; temperature?: number },
  ): Promise<OpenRouterResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const res = await fetch(BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey()}`,
          "HTTP-Referer": "https://playdndai.com",
          "X-Title": "Ashveil DnD",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: config.max_tokens,
          temperature: config.temperature,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter API ${res.status}: ${errText}`);
      }

      return (await res.json()) as OpenRouterResponse;
    } finally {
      clearTimeout(timeout);
    }
  }
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}
