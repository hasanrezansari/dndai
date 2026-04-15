import { LegalPageShell } from "@/components/legal/legal-page-shell";

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms & Conditions" lastUpdated="2026-04-15">
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Service use</h2>
        <p>
          By using this service, you agree to use it lawfully and not abuse,
          disrupt, reverse engineer, or attempt unauthorized access to systems
          or accounts.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Accounts and purchases</h2>
        <p>
          You are responsible for account security and activity under your
          account. Digital purchases (including Sparks) are subject to our
          refund and cancellation policy.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Third-party payment services</h2>
        <p>
          Payment processing uses third-party providers (including Dodo
          Payments and Razorpay) and is subject to their applicable terms,
          policies, and fraud controls.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Changes and termination</h2>
        <p>
          We may update these terms to reflect product, legal, or operational
          changes. We may suspend or terminate access for policy violations,
          abuse, or legal/compliance reasons.
        </p>
      </section>
    </LegalPageShell>
  );
}
