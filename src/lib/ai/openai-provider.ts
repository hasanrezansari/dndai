import OpenAI from "openai";

import type { AIProvider, ModelTier, TokenUsage, ZodSchema } from "@/lib/ai/types";

const MODEL_MAP = { heavy: "gpt-4o", light: "gpt-4o-mini" } as const;

const DEFAULT_TIMEOUT_MS = 60_000;

function extractJsonObject(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence?.[1]) return fence[1].trim();
  return t;
}

export class OpenAIProvider implements AIProvider {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.client;
  }

  private modelName(tier: ModelTier): string {
    return MODEL_MAP[tier];
  }

  private usageFrom(
    model: string,
    u:
      | {
          prompt_tokens?: number;
          completion_tokens?: number;
        }
      | undefined,
  ): TokenUsage {
    return {
      inputTokens: u?.prompt_tokens ?? 0,
      outputTokens: u?.completion_tokens ?? 0,
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
    const baseMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ];

    const run = async (
      messages: OpenAI.Chat.ChatCompletionMessageParam[],
    ): Promise<{ parsed: unknown; usage: TokenUsage }> => {
      const completion = await client.chat.completions.create(
        {
          model,
          messages,
          response_format: { type: "json_object" },
          max_tokens: params.maxTokens ?? 2048,
          temperature: params.temperature ?? 0.7,
        },
        { timeout: DEFAULT_TIMEOUT_MS },
      );
      const text = completion.choices[0]?.message?.content ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJsonObject(text));
      } catch {
        throw new SyntaxError("Invalid JSON from model");
      }
      return {
        parsed,
        usage: this.usageFrom(model, completion.usage),
      };
    };

    let messages = baseMessages;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { parsed, usage } = await run(messages);
        const validated = params.schema.safeParse(parsed);
        if (validated.success) {
          return { data: validated.data, usage };
        }
        lastErr = validated.error;
      } catch (e) {
        lastErr = e;
      }
      messages = [
        ...baseMessages,
        {
          role: "user",
          content:
            "Your previous reply was not valid. Respond ONLY with a single valid JSON object matching the schema. No markdown, no prose.",
        },
      ];
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
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        max_tokens: params.maxTokens ?? 1024,
        temperature: params.temperature ?? 0.7,
      },
      { timeout: DEFAULT_TIMEOUT_MS },
    );
    const text = completion.choices[0]?.message?.content ?? "";
    return {
      text,
      usage: this.usageFrom(model, completion.usage),
    };
  }
}
