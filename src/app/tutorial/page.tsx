"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";

export default function TutorialPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tutorial/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goToCharacter: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        sessionId?: string;
      };
      if (!res.ok || !data.sessionId) {
        setError("Could not start tutorial. Try again.");
        return;
      }
      try {
        window.localStorage.setItem("falvos.tutorial.started", "1");
      } catch {
        /* ignore */
      }
      router.push(`/character/${data.sessionId}?tutorial=1`);
    } catch {
      setError("Network error — could not start tutorial.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[var(--color-obsidian)] text-[var(--color-silver-muted)] px-6 pb-10 pt-12 max-w-md mx-auto flex flex-col gap-8">
      <header className="text-center space-y-2">
        <h1 className="text-fantasy text-3xl font-black uppercase tracking-tight text-[var(--color-gold-rare)]">
          Tutorial
        </h1>
        <p className="text-xs text-[var(--color-silver-dim)] font-serif italic leading-relaxed">
          A short guided run to learn the core loop: intent → dice → consequences
          → narration.
        </p>
      </header>

      <section className="rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-container)]/35 p-5 space-y-3">
        <p className="text-sm leading-relaxed">
          You’ll take 3 quick turns. The story never punishes experimentation —
          it rewards bold choices.
        </p>
        <ul className="text-xs text-[var(--color-silver-dim)] space-y-1 list-disc pl-5">
          <li>Create a hero</li>
          <li>Make your first action</li>
          <li>See a dice check resolve</li>
          <li>Finish and start a real adventure</li>
        </ul>
      </section>

      {error ? (
        <div className="bg-[var(--color-failure)]/10 border-l-4 border-[var(--color-failure)] p-3 rounded-r-[var(--radius-card)]">
          <p className="text-sm text-[var(--color-failure)]" role="alert">
            {error}
          </p>
        </div>
      ) : null}

      <div className="mt-auto space-y-3">
        <GoldButton
          type="button"
          size="lg"
          className="w-full min-h-[56px] flex items-center justify-center gap-3 text-lg"
          disabled={busy || authStatus === "loading"}
          onClick={() => void handleStart()}
        >
          {busy ? "Opening…" : "Start Tutorial"}
        </GoldButton>
        <GhostButton
          type="button"
          className="w-full min-h-[44px] text-[10px] font-bold uppercase tracking-[0.15em]"
          onClick={() => router.push("/")}
          disabled={busy}
        >
          Back
        </GhostButton>
      </div>
    </main>
  );
}

