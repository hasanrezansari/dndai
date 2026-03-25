import type { AIProvider, ModelTier, TokenUsage, ZodSchema } from "@/lib/ai/types";

const MODEL_MAP = {
  heavy: "gemini-2.0-flash",
  light: "gemini-2.0-flash-lite",
} as const;

const DEFAULT_TIMEOUT_MS = 60_000;
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function extractJsonObject(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence?.[1]) return fence[1].trim();
  return t;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

export class GeminiProvider implements AIProvider {
  private apiKey(): string {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    return key;
  }

  private modelName(tier: ModelTier): string {
    return MODEL_MAP[tier];
  }

  private usageFrom(model: string, meta?: GeminiResponse["usageMetadata"]): TokenUsage {
    return {
      inputTokens: meta?.promptTokenCount ?? 0,
      outputTokens: meta?.candidatesTokenCount ?? 0,
      model,
    };
  }

  private async callGemini(model: string, contents: unknown[], systemInstruction?: string, config?: { maxOutputTokens?: number; temperature?: number; responseMimeType?: string }): Promise<GeminiResponse> {
    const url = `${BASE_URL}/${model}:generateContent?key=${this.apiKey()}`;

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    if (config) {
      body.generationConfig = {
        ...(config.maxOutputTokens && { maxOutputTokens: config.maxOutputTokens }),
        ...(config.temperature !== undefined && { temperature: config.temperature }),
        ...(config.responseMimeType && { responseMimeType: config.responseMimeType }),
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API ${res.status}: ${errText}`);
      }

      return (await res.json()) as GeminiResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractText(response: GeminiResponse): string {
    return response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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
        const response = await this.callGemini(
          model,
          [{ role: "user", parts: [{ text: userContent }] }],
          system,
          {
            maxOutputTokens: params.maxTokens ?? 4096,
            temperature: params.temperature ?? 0.7,
            responseMimeType: "application/json",
          },
        );

        const text = this.extractText(response);
        let parsed: unknown;
        try {
          parsed = JSON.parse(extractJsonObject(text));
        } catch {
          throw new SyntaxError("Invalid JSON from model");
        }

        const validated = params.schema.safeParse(parsed);
        if (validated.success) {
          return { data: validated.data, usage: this.usageFrom(model, response.usageMetadata) };
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

    const response = await this.callGemini(
      model,
      [{ role: "user", parts: [{ text: params.userPrompt }] }],
      params.systemPrompt,
      {
        maxOutputTokens: params.maxTokens ?? 4096,
        temperature: params.temperature ?? 0.7,
      },
    );

    return {
      text: this.extractText(response),
      usage: this.usageFrom(model, response.usageMetadata),
    };
  }
}
