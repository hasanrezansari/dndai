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

export function handleApiError(error: unknown): Response {
  if (error instanceof ApiError) {
    return apiError(error.message, error.status);
  }
  console.error("Unhandled API error:", error);
  return apiError("Internal server error", 500);
}
