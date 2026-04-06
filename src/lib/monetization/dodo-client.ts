/**
 * Dodo Payments REST helpers (checkout sessions + payment lookup).
 * @see https://docs.dodopayments.com/api-reference/integration-guide
 */

export function getDodoApiBase(): string {
  const override = process.env.DODO_PAYMENTS_API_BASE?.trim();
  if (override) return override.replace(/\/$/, "");
  const env = process.env.DODO_PAYMENTS_ENV?.toLowerCase();
  if (env === "live" || env === "production") {
    return "https://live.dodopayments.com";
  }
  return "https://test.dodopayments.com";
}

export async function dodoAuthorizedFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T }> {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("DODO_PAYMENTS_API_KEY is not configured");
  }
  const url = `${getDodoApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export type DodoCheckoutSessionCreateBody = {
  product_cart: Array<{ product_id: string; quantity: number }>;
  customer: { email: string; name?: string };
  return_url: string;
  metadata?: Record<string, string>;
  confirm?: boolean;
};

export type DodoCheckoutSessionResponse = {
  checkout_url?: string;
  session_id?: string;
  message?: string;
  error?: string;
};

export async function createDodoCheckoutSession(
  body: DodoCheckoutSessionCreateBody,
): Promise<{ ok: boolean; status: number; data: DodoCheckoutSessionResponse }> {
  return dodoAuthorizedFetch<DodoCheckoutSessionResponse>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      confirm: body.confirm ?? true,
      product_cart: body.product_cart,
      customer: body.customer,
      return_url: body.return_url,
      metadata: body.metadata ?? undefined,
      customization: {
        theme: "system",
        show_order_details: true,
        show_on_demand_tag: true,
      },
      feature_flags: {
        allow_currency_selection: true,
        allow_discount_code: true,
        allow_phone_number_collection: true,
        allow_tax_id: true,
        always_create_new_customer: false,
      },
      show_saved_payment_methods: true,
    }),
  });
}

export async function getDodoCheckoutSession(
  sessionId: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return dodoAuthorizedFetch<Record<string, unknown>>(
    `/checkouts/${encodeURIComponent(sessionId)}`,
    { method: "GET" },
  );
}

export async function getDodoPayment(
  paymentId: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  return dodoAuthorizedFetch<Record<string, unknown>>(
    `/payments/${encodeURIComponent(paymentId)}`,
    { method: "GET" },
  );
}
