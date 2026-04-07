import Link from "next/link";

const ghostLg =
  "block w-full min-h-[48px] px-8 py-4 text-base inline-flex items-center justify-center bg-transparent text-[var(--color-silver-muted)] border border-[var(--border-ui-strong)] rounded-[var(--radius-button)] font-bold uppercase tracking-[0.1em] transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)] hover:border-[var(--color-gold-rare)] hover:text-[var(--color-gold-rare)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]";

const ghostMd =
  "block w-full min-h-[44px] px-6 py-3 text-sm inline-flex items-center justify-center bg-transparent text-[var(--color-silver-muted)] border border-[var(--border-ui-strong)] rounded-[var(--radius-button)] font-bold uppercase tracking-[0.1em] transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)] hover:border-[var(--color-gold-rare)] hover:text-[var(--color-gold-rare)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]";

export default function WorldSubmitGuidePage() {
  return (
    <div className="min-h-dvh bg-[var(--color-obsidian)] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b border-[var(--border-divide)] bg-[var(--color-obsidian)]/92 backdrop-blur-[var(--glass-blur)] px-4 py-3 flex items-center justify-between gap-3">
        <Link
          href="/worlds"
          className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-silver-muted)] hover:text-[var(--color-gold-rare)]"
        >
          ← Worlds
        </Link>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--outline)]">
          Publish
        </span>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-8 space-y-6">
        <div>
          <h1 className="text-fantasy text-2xl font-black text-[var(--color-gold-rare)]">
            Publish from play
          </h1>
          <p className="text-sm text-[var(--color-silver-dim)] mt-2 leading-relaxed">
            Community templates are created from real campaign sessions — not from a blank form.
            When you are the host of an active or finished campaign, open the session and use{" "}
            <strong className="text-[var(--color-silver-muted)]">Publish as world template</strong>{" "}
            under Session &amp; cast. Submissions go to a moderation queue and only appear on the
            public gallery after approval.
          </p>
        </div>

        <ul className="text-xs text-[var(--color-silver-dim)] space-y-2 list-disc pl-4 leading-relaxed">
          <li>Google sign-in is required (guest accounts cannot submit).</li>
          <li>Campaign mode only — party games are not eligible.</li>
          <li>
            You need at least two rounds <em>or</em> two story beats before publishing.
          </li>
          <li>One catalog draft per play session.</li>
        </ul>

        <div className="flex flex-col gap-2 pt-2">
          <Link href="/adventures" className={ghostLg}>
            My adventures
          </Link>
          <Link href="/worlds" className={ghostMd}>
            Back to worlds gallery
          </Link>
        </div>
      </main>
    </div>
  );
}
