import type { ToastOptions } from "@/components/ui/toast";
import { COPY } from "@/lib/copy/ashveil";

export type ApiErrorBody = { error?: string; code?: string };

export function insufficientSparksToastOptions(): ToastOptions {
  return {
    duration: 9000,
    action: { label: COPY.spark.buySparksCta, href: "/shop" },
  };
}

export function isInsufficientSparksApi(
  status: number,
  body: ApiErrorBody,
): boolean {
  return status === 402 && body.code === "insufficient_sparks";
}
