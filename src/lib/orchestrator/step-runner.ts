import type { AIProvider, ModelTier, OrchestrationStepResult, TokenUsage, ZodSchema } from "@/lib/ai/types";
import { waitForAIRateLimit } from "@/lib/ai/rate-limiter";
import { logTrace } from "@/lib/orchestrator/trace";

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function isUnretryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("rate") ||
    msg.includes("billing") ||
    msg.includes("credit") ||
    msg.includes("insufficient")
  );
}

export async function runOrchestrationStep<T>(params: {
  stepName: string;
  sessionId: string;
  turnId: string | null;
  provider: AIProvider;
  model: ModelTier;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodSchema<T>;
  maxTokens?: number;
  temperature?: number;
  fallback?: () => T;
  timeoutMs?: number;
}): Promise<OrchestrationStepResult<T>> {
  const timeoutMs = params.timeoutMs ?? 20_000;
  const t0 = Date.now();

  const emptyUsage = (model: string): TokenUsage => ({
    inputTokens: 0,
    outputTokens: 0,
    model,
  });

  const runWithTimeout = async (userPrompt: string) => {
    const p = params.provider.generateStructured({
      model: params.model,
      systemPrompt: params.systemPrompt,
      userPrompt,
      schema: params.schema,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
    });
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
  };

  let usage: TokenUsage = emptyUsage("none");
  let data!: T;
  const success = true;
  let error: string | undefined;

  try {
    await waitForAIRateLimit(params.sessionId);
    const r1 = await runWithTimeout(params.userPrompt);
    data = r1.data;
    usage = r1.usage;
  } catch (e1) {
    const msg1 = e1 instanceof Error ? e1.message : String(e1);
    console.error(
      `[orchestration:${params.stepName}] attempt 1 failed`,
      params.sessionId,
      msg1,
    );

    if (isUnretryable(e1) && params.fallback) {
      data = params.fallback();
      usage = emptyUsage("fallback");
      error = `${msg1}; used fallback`;
    } else if (params.fallback) {
      try {
        const r2 = await runWithTimeout(
          `${params.userPrompt}\n\nRespond ONLY with valid JSON matching the schema exactly.`,
        );
        data = r2.data;
        usage = r2.usage;
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        console.error(
          `[orchestration:${params.stepName}] attempt 2 failed`,
          params.sessionId,
          msg2,
        );
        data = params.fallback();
        usage = emptyUsage("fallback");
        error = `${msg2}; used fallback`;
      }
    } else {
      const latencyMs = Date.now() - t0;
      await logTrace({
        sessionId: params.sessionId,
        turnId: params.turnId,
        stepName: params.stepName,
        input: asRecord({
          systemPrompt: params.systemPrompt,
          userPrompt: params.userPrompt,
        }),
        output: {},
        modelUsed: usage.model,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs,
        success: false,
        errorMessage: msg1,
      });
      throw e1;
    }
  }

  const latencyMs = Date.now() - t0;

  await logTrace({
    sessionId: params.sessionId,
    turnId: params.turnId,
    stepName: params.stepName,
    input: asRecord({
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
    }),
    output: asRecord(data as unknown),
    modelUsed: usage.model,
    tokensIn: usage.inputTokens,
    tokensOut: usage.outputTokens,
    latencyMs,
    success,
    errorMessage: error,
  });

  return { data, usage, latencyMs, success, error };
}
