import { LegalPageShell } from "@/components/legal/legal-page-shell";

export default function ShippingDeliveryPage() {
  return (
    <LegalPageShell title="Shipping & Delivery Policy" lastUpdated="2026-04-15">
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Digital-only delivery</h2>
        <p>
          This service delivers digital goods and features only. We do not
          ship physical products.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Delivery timing</h2>
        <p>
          Most digital purchases are delivered immediately after successful
          payment confirmation. In rare cases, webhook delays can cause short
          processing windows before value appears in your account.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Support for delayed delivery</h2>
        <p>
          If delivery is delayed beyond 24 hours, contact support with your
          order identifier so we can verify payment and reconcile your account.
        </p>
      </section>
    </LegalPageShell>
  );
}
