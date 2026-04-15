import { LegalPageShell } from "@/components/legal/legal-page-shell";

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="2026-04-15">
      <section className="space-y-2">
        <h2 className="text-base font-semibold">What we collect</h2>
        <p>
          We collect account information (such as name and email), gameplay
          content you submit, and payment-related identifiers needed to deliver
          Sparks purchases and account support.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">How we use data</h2>
        <p>
          We use data to provide the service, process payments, prevent fraud,
          improve product quality, and respond to support requests.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Payment processors</h2>
        <p>
          Payments are handled by trusted processors, including Dodo Payments
          and Razorpay for supported regions. We do not store raw card numbers
          on our servers.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Your rights</h2>
        <p>
          You can request account-data export, correction, or deletion by
          contacting support. We may retain required records for legal,
          tax, fraud-prevention, and dispute-handling purposes.
        </p>
      </section>
    </LegalPageShell>
  );
}
