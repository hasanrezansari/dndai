import { InsufficientSparksError } from "@/server/services/spark-economy-service";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** 402 — host (or payer) lacks Sparks for a paid AI/image action. */
export function insufficientSparksResponse(params: {
  balance: number;
  required: number;
}): Response {
  return Response.json(
    {
      error:
        "The host does not have enough Sparks to continue. Buy Sparks or ask the table to contribute.",
      code: "insufficient_sparks",
      balance: params.balance,
      required: params.required,
    },
    { status: 402 },
  );
}

export function handleApiError(error: unknown): Response {
  if (error instanceof ApiError) {
    return apiError(error.message, error.status);
  }
  if (error instanceof InsufficientSparksError) {
    return insufficientSparksResponse({
      balance: error.balance,
      required: error.required,
    });
  }
  console.error("Unhandled API error:", error);
  return apiError("Internal server error", 500);
}
