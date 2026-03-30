"use client";

import Link from "next/link";
import { useState } from "react";

import { GoldButton } from "@/components/ui/gold-button";
import { JOIN_CODE_ALPHABET } from "@/lib/join-code";

export default function TvWatchPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== 6) {
      setError("Enter the 6-character room code");
      return;
    }
    for (const ch of normalized) {
      if (!JOIN_CODE_ALPHABET.includes(ch)) {
        setError("Invalid character in code");
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch("/api/sessions/watch-display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: normalized }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        path?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not open room display");
        return;
      }
      if (!body.path || typeof window === "undefined") return;
      window.location.href = `${window.location.origin}${body.path}`;
    } catch {
      setError("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-10 bg-[var(--color-obsidian)]">
      <div className="w-full max-w-md flex flex-col gap-[var(--void-gap-lg)]">
        <header className="text-center space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--outline)]">
            Watch only
          </p>
          <h1 className="text-fantasy text-2xl font-bold text-[var(--color-gold-rare)] tracking-tight uppercase">
            Room display
          </h1>
          <p className="text-sm text-[var(--color-silver-dim)] leading-relaxed">
            Ask your party for the <strong className="text-[var(--color-silver-muted)]">6-character room code</strong>. This opens the shared TV view — you are not joining as a player.
          </p>
        </header>

        <form
          onSubmit={(ev) => void handleSubmit(ev)}
          className="rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.28)] bg-[var(--surface-high)]/80 p-6 flex flex-col gap-4"
        >
          <label
            htmlFor="tv-room-code"
            className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-gold-rare)]/80 ml-1"
          >
            Room code
          </label>
          <input
            id="tv-room-code"
            type="text"
            name="joinCode"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={6}
            placeholder="AB12CD"
            className="w-full min-h-[56px] bg-[var(--color-deep-void)] border-none text-center text-2xl font-serif tracking-[0.35em] text-[var(--color-gold-rare)] placeholder:text-[var(--outline)]/35 rounded-[var(--radius-card)] focus:ring-1 focus:ring-[var(--color-gold-rare)]/40 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)] uppercase"
          />
          {error ? (
            <p className="text-sm text-[var(--color-failure)] text-center">
              {error}
            </p>
          ) : null}
          <GoldButton
            type="submit"
            size="lg"
            className="w-full min-h-[52px]"
            disabled={busy}
          >
            {busy ? "Opening…" : "Show table"}
          </GoldButton>
        </form>

        <Link
          href="/"
          className="text-center text-xs uppercase tracking-[0.15em] text-[var(--color-silver-dim)] hover:text-[var(--color-gold-rare)] transition-colors flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Back to home
        </Link>
      </div>
    </main>
  );
}
