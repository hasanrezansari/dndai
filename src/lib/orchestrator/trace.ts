import { db } from "@/lib/db";
import { orchestrationTraces } from "@/lib/db/schema";

const MAX_LEN = 500;

function redactValue(value: unknown): unknown {
  if (typeof value === "string" && value.length > MAX_LEN) {
    return `${value.slice(0, MAX_LEN)}…`;
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value !== null && typeof value === "object") {
    return redactRecord(value as Record<string, unknown>);
  }
  return value;
}

function redactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = redactValue(v);
  }
  return out;
}

export async function logTrace(params: {
  sessionId: string;
  turnId: string | null;
  stepName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
}): Promise<void> {
  await db.insert(orchestrationTraces).values({
    session_id: params.sessionId,
    turn_id: params.turnId,
    step_name: params.stepName,
    input_summary: redactRecord(params.input),
    output_summary: redactRecord(params.output),
    model_used: params.modelUsed,
    tokens_in: params.tokensIn,
    tokens_out: params.tokensOut,
    latency_ms: params.latencyMs,
    success: params.success,
    error_message: params.errorMessage ?? null,
  });
}
