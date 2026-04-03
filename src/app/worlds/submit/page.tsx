"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";

export default function WorldSubmitPage() {
  const router = useRouter();
  const { status } = useSession();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [adventurePrompt, setAdventurePrompt] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [artDirection, setArtDirection] = useState("");
  const [worldBible, setWorldBible] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("4");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || status !== "authenticated") return;
    setErr(null);
    setBusy(true);
    const tags = tagsRaw
      .split(/[,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
    const mp = Number(maxPlayers);
    try {
      const res = await fetch("/api/worlds/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          description: description.trim(),
          adventurePrompt: adventurePrompt.trim() || null,
          tags: tags.length ? tags : undefined,
          artDirection: artDirection.trim() || null,
          worldBible: worldBible.trim() || null,
          defaultMaxPlayers: Number.isFinite(mp) ? mp : 4,
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Could not submit";
        setErr(msg);
        return;
      }
      router.push("/profile");
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--color-obsidian)] text-[var(--color-silver-dim)] text-sm">
        Loading…
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 bg-[var(--color-obsidian)]">
        <p className="text-sm text-[var(--color-silver-dim)] text-center">
          Sign in to submit a world to the catalog.
        </p>
        <Link
          href="/"
          className="text-[var(--color-gold-rare)] text-sm font-bold uppercase tracking-[0.12em]"
        >
          Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--color-obsidian)] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b border-[rgba(77,70,53,0.2)] bg-[var(--color-obsidian)]/92 backdrop-blur-[var(--glass-blur)] px-4 py-3 flex items-center justify-between gap-3">
        <Link
          href="/worlds"
          className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-silver-muted)] hover:text-[var(--color-gold-rare)]"
        >
          ← Worlds
        </Link>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--outline)]">
          Submit
        </span>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-8 space-y-6">
        <div>
          <h1 className="text-fantasy text-2xl font-black text-[var(--color-gold-rare)]">
            Submit a story world
          </h1>
          <p className="text-sm text-[var(--color-silver-dim)] mt-2 leading-relaxed">
            Your pitch goes to a moderation queue. It will not appear on the public gallery
            until approved. Sign in with Google is required (guest accounts cannot submit).
          </p>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              Title *
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
              className="w-full min-h-[44px] px-3 rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.25)] text-[var(--color-silver-muted)]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              Subtitle / hook
            </span>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              maxLength={240}
              className="w-full min-h-[44px] px-3 rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.25)] text-[var(--color-silver-muted)]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              Premise / description * (min 20 chars)
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              minLength={20}
              maxLength={8000}
              rows={5}
              className="w-full px-3 py-2 rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.25)] text-[var(--color-silver-muted)] text-sm leading-relaxed"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              Adventure prompt (optional — defaults to description)
            </span>
            <textarea
              value={adventurePrompt}
              onChange={(e) => setAdventurePrompt(e.target.value)}
              maxLength={8000}
              rows={3}
              className="w-full px-3 py-2 rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.25)] text-[var(--color-silver-muted)] text-sm leading-relaxed"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              Tags (comma-separated, max 12)
            </span>
            <input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="horror, mystery, coastal"
              className="w-full min-h-[44px] px-3 rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.25)] text-[var(--color-silver-muted)]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              Art direction (optional)
            </span>
            <textarea
              value={artDirection}
              onChange={(e) => setArtDirection(e.target.value)}
              maxLength={2000}
              rows={2}
              className="w-full px-3 py-2 rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.25)] text-[var(--color-silver-muted)] text-sm leading-relaxed"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              World bible (optional)
            </span>
            <textarea
              value={worldBible}
              onChange={(e) => setWorldBible(e.target.value)}
              maxLength={16000}
              rows={4}
              className="w-full px-3 py-2 rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.25)] text-[var(--color-silver-muted)] text-sm leading-relaxed"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              Default max players (1–8)
            </span>
            <input
              type="number"
              min={1}
              max={8}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.25)] text-[var(--color-silver-muted)]"
            />
          </label>

          {err ? (
            <p className="text-sm text-[var(--color-failure)] leading-relaxed">{err}</p>
          ) : null}

          <div className="flex flex-col gap-2 pt-2">
            <GoldButton type="submit" size="lg" className="w-full min-h-[48px]" disabled={busy}>
              {busy ? "Sending…" : "Submit for review"}
            </GoldButton>
            <GhostButton
              type="button"
              size="md"
              className="w-full"
              onClick={() => router.push("/worlds")}
            >
              Cancel
            </GhostButton>
          </div>
        </form>
      </main>
    </div>
  );
}
