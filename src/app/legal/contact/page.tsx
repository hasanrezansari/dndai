import { LegalPageShell } from "@/components/legal/legal-page-shell";

export default function ContactPage() {
  return (
    <LegalPageShell title="Contact Us" lastUpdated="2026-04-15">
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Support</h2>
        <p>Email: support@example.com</p>
        <p>Phone: +1-000-000-0000</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Business address</h2>
        <p>123 Business Street, Suite 100, City, State, Postal Code, Country</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Grievance officer (India)</h2>
        <p>Name: Compliance Officer</p>
        <p>Email: grievance@example.com</p>
        <p>Phone: +1-000-000-0000</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Response timelines</h2>
        <p>
          We aim to acknowledge complaints within 48 hours and resolve them
          within 30 days.
        </p>
      </section>
    </LegalPageShell>
  );
}
