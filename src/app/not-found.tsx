import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[var(--color-obsidian)] px-6 py-10 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-85"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 30%, rgba(123, 45, 142, 0.14) 0%, transparent 50%), radial-gradient(ellipse 55% 40% at 50% 85%, rgba(15, 15, 26, 1) 0%, transparent 45%)",
        }}
        aria-hidden
      />
      <div className="relative z-10 flex flex-col items-center gap-5 max-w-md text-center">
        <h1 className="text-fantasy text-3xl sm:text-4xl text-[var(--color-silver-muted)] tracking-[0.08em]">
          Lost in the Void
        </h1>
        <p className="text-base text-[var(--color-silver-dim)] leading-relaxed">
          The path you seek does not exist in this realm.
        </p>
        <Link
          href="/"
          className="mt-4 w-full max-w-xs min-h-[44px] flex items-center justify-center px-8 py-4 text-lg font-semibold bg-[var(--color-gold-rare)] text-[var(--color-obsidian)] rounded-[var(--radius-button)] transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)] hover:brightness-110 hover:shadow-[0_0_20px_rgba(212,175,55,0.3)] active:scale-[0.97]"
        >
          Return to Ashveil
        </Link>
      </div>
    </div>
  );
}
