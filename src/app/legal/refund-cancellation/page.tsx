import { LegalPageShell } from "@/components/legal/legal-page-shell";

export default function RefundCancellationPage() {
  return (
    <LegalPageShell title="Refund & Cancellation Policy" lastUpdated="2026-04-15">
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Refund window</h2>
        <p>
          Eligible refund requests should be submitted within 7 days of
          purchase. Approved refunds are typically processed within 5 to 7
          business days through the original payment method.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">When refunds are eligible</h2>
        <p>
          Refunds may be granted for duplicate charges, technical failures that
          prevented delivery, or billing errors verified by our support team.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">When refunds may be declined</h2>
        <p>
          Refunds may be declined for abuse, misuse, or completed digital
          consumption where the purchase was successfully delivered as described.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Cancellation</h2>
        <p>
          You can request cancellation before fulfillment where applicable.
          Once digital value has been delivered to your account, cancellation
          may not be possible.
        </p>
      </section>
    </LegalPageShell>
  );
}
