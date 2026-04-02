import type { NextRequest } from "next/server";

import { handlers } from "@/lib/auth/config";
import {
  logAuthHttpRequest,
  logAuthHttpResponse,
} from "@/lib/auth/auth-server-log";

async function withAuthHttpLog(
  handler: (req: NextRequest) => Promise<Response>,
  req: NextRequest,
): Promise<Response> {
  logAuthHttpRequest(req);
  try {
    const res = await handler(req);
    logAuthHttpResponse(req, res);
    return res;
  } catch (err) {
    console.error(
      "[ashveil-auth]",
      JSON.stringify({
        t: new Date().toISOString(),
        kind: "handler_throw",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    throw err;
  }
}

export async function GET(req: NextRequest) {
  return withAuthHttpLog(handlers.GET, req);
}

export async function POST(req: NextRequest) {
  return withAuthHttpLog(handlers.POST, req);
}
