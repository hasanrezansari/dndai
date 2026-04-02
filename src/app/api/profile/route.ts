import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { authUsers } from "@/lib/db/schema";

const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1).max(48),
  image: z
    .string()
    .trim()
    .refine(
      (v) => {
        if (!v) return false;
        if (v.startsWith("data:image/")) return true;
        try {
          // eslint-disable-next-line no-new
          new URL(v);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid image" },
    )
    .nullable()
    .optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const [row] = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        image: authUsers.image,
      })
      .from(authUsers)
      .where(eq(authUsers.id, user.id))
      .limit(1);

    return NextResponse.json({
      id: user.id,
      name: row?.name ?? user.name ?? "Adventurer",
      email: row?.email ?? null,
      image: row?.image ?? null,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }
    const parsed = UpdateProfileSchema.safeParse(json);
    if (!parsed.success) {
      return apiError("Invalid body", 400);
    }

    const name = parsed.data.name;
    const image =
      parsed.data.image === undefined ? undefined : (parsed.data.image ?? null);

    await db
      .update(authUsers)
      .set({
        name,
        image: image === undefined ? undefined : image,
      })
      .where(eq(authUsers.id, user.id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

