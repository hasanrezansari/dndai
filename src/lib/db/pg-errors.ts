/** Walk Error.cause chain (and Drizzle-wrapped errors) for Postgres error codes. */
export function postgresErrorChain(e: unknown): Array<{ code?: string; message?: string }> {
  const out: Array<{ code?: string; message?: string }> = [];
  let cur: unknown = e;
  for (let i = 0; i < 8 && cur !== undefined && cur !== null; i++) {
    if (typeof cur === "object" && cur !== null) {
      const o = cur as Record<string, unknown>;
      const code = typeof o.code === "string" ? o.code : undefined;
      const message = typeof o.message === "string" ? o.message : undefined;
      out.push({ code, message });
    } else if (cur instanceof Error) {
      out.push({ message: cur.message });
    }
    cur =
      cur instanceof Error && cur.cause !== undefined && cur.cause !== null
        ? cur.cause
        : null;
  }
  return out;
}

/** Undefined table / relation (e.g. migration not applied on production). */
export function isPostgresUndefinedRelationError(
  e: unknown,
  relationName: string,
): boolean {
  const chain = postgresErrorChain(e);
  const needle = `relation "${relationName}" does not exist`;
  for (const row of chain) {
    if (row.code === "42P01" && row.message?.includes(relationName)) return true;
    if (row.message?.includes(needle)) return true;
  }
  return false;
}
