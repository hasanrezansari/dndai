"use client";

import Link from "next/link";

const LINKS: Array<{ href: string; label: string }> = [
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/terms", label: "Terms & Conditions" },
  { href: "/legal/refund-cancellation", label: "Refund & Cancellation" },
  { href: "/legal/shipping-delivery", label: "Shipping & Delivery" },
  { href: "/legal/contact", label: "Contact Us" },
];

export function SiteFooterLinks() {
  return (
    <footer className="mt-8 border-t border-[var(--border-ui)] pt-4">
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.14em] text-[var(--outline)]">
        {LINKS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="underline decoration-transparent underline-offset-4 transition-colors hover:text-[var(--color-gold-rare)] hover:decoration-[var(--color-gold-rare)]"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </footer>
  );
}
