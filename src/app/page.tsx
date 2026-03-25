"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { COPY } from "@/lib/copy/ashveil";
import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";
import { ModeCardsSkeleton } from "@/components/ui/loading-skeleton";
import { PillSelect } from "@/components/ui/pill-select";
import type { CampaignMode, SessionMode } from "@/lib/schemas/enums";

const CAMPAIGN_OPTIONS: { value: CampaignMode; label: string }[] = [
  { value: "user_prompt", label: "User Prompt" },
  { value: "random", label: "Random Journey" },
  { value: "module", label: "Module Remix" },
];

const PARTY_SIZES = [2, 3, 4, 5, 6] as const;

export default function Home() {
  const router = useRouter();
  const { data: authSession, status: authStatus } = useSession();
  const [mode, setMode] = useState<SessionMode | null>(null);
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("user_prompt");
  const [maxPlayers, setMaxPlayers] = useState<(typeof PARTY_SIZES)[number]>(4);
  const [adventurePrompt, setAdventurePrompt] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinShakeKey, setJoinShakeKey] = useState(0);
  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate() {
    if (!mode || createLoading) return;
    setCreateError(null);
    setCreateLoading(true);
    try {
      const body: {
        mode: SessionMode;
        campaignMode: CampaignMode;
        maxPlayers: number;
        adventurePrompt?: string;
        moduleKey?: string;
      } = {
        mode,
        campaignMode,
        maxPlayers,
      };
      if (campaignMode === "user_prompt" && adventurePrompt.trim()) {
        body.adventurePrompt = adventurePrompt.trim();
      }
      if (campaignMode === "module") {
        body.moduleKey = "module_remix_default";
      }
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "Could not create session";
        setCreateError(err);
        return;
      }
      const joinCodeOut =
        typeof data === "object" &&
        data !== null &&
        "joinCode" in data &&
        typeof (data as { joinCode: unknown }).joinCode === "string"
          ? (data as { joinCode: string }).joinCode
          : null;
      if (joinCodeOut) {
        router.push(`/lobby/${joinCodeOut}`);
      }
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (joinLoading) return;
    setJoinError(null);
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter a join code");
      setJoinShakeKey((k) => k + 1);
      return;
    }
    setJoinLoading(true);
    try {
      const res = await fetch("/api/sessions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: code }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "Invalid code";
        setJoinError(err);
        setJoinShakeKey((k) => k + 1);
        return;
      }
      router.push(`/lobby/${code}`);
    } finally {
      setJoinLoading(false);
    }
  }

  if (authStatus === "loading") {
    return (
      <main className="min-h-dvh flex flex-col items-center px-5 pt-10 pb-8 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-[var(--color-obsidian)]"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-[var(--color-deep-void)] via-transparent to-[var(--color-obsidian)] opacity-90"
          aria-hidden
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 20%, rgba(123, 45, 142, 0.12) 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 50% 85%, rgba(212, 175, 55, 0.06) 0%, transparent 50%)",
          }}
          aria-hidden
        />
        <div className="relative z-10 flex flex-col items-center gap-[var(--void-gap-lg)] w-full max-w-md">
          <header className="text-center flex flex-col gap-3">
            <h1
              className="text-fantasy text-4xl sm:text-5xl font-bold text-gold-rare tracking-[0.12em] uppercase animate-breathe"
              style={{
                textShadow:
                  "0 0 40px rgba(212, 175, 55, 0.25), 0 0 80px rgba(123, 45, 142, 0.15)",
              }}
            >
              ASHVEIL
            </h1>
            <p className="text-[var(--color-silver-muted)] text-base tracking-wide">
              {COPY.tagline}
            </p>
          </header>
          <ModeCardsSkeleton />
          <p className="text-sm text-[var(--color-silver-dim)] text-center">
            Entering the world…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col items-center px-5 pt-10 pb-8 relative overflow-hidden">
      <div
        className="absolute inset-0 bg-[var(--color-obsidian)]"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-[var(--color-deep-void)] via-transparent to-[var(--color-obsidian)] opacity-90"
        aria-hidden
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 20%, rgba(123, 45, 142, 0.12) 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 50% 85%, rgba(212, 175, 55, 0.06) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      <div className="relative z-10 flex flex-col items-center gap-[var(--void-gap-lg)] w-full max-w-md">
        <header className="text-center flex flex-col gap-3">
          <h1
            className="text-fantasy text-4xl sm:text-5xl font-bold text-gold-rare tracking-[0.12em] uppercase animate-breathe"
            style={{
              textShadow:
                "0 0 40px rgba(212, 175, 55, 0.25), 0 0 80px rgba(123, 45, 142, 0.15)",
            }}
          >
            ASHVEIL
          </h1>
          <p className="text-[var(--color-silver-muted)] text-base tracking-wide">
            {COPY.tagline}
          </p>
          {authSession?.user?.name ? (
            <p className="text-xs text-[var(--color-silver-dim)]">
              Signed in as {authSession.user.name}
            </p>
          ) : null}
        </header>

        <div className="flex flex-col gap-[var(--void-gap)] w-full">
          <button
            type="button"
            onClick={() => setMode("ai_dm")}
            className="text-left w-full min-h-[44px] rounded-[var(--radius-card)] transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-support)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
          >
            <GlassCard
              className={`p-5 w-full transition-all duration-[var(--duration-med)] hover:shadow-[0_0_32px_rgba(123,45,142,0.18)] ${
                mode === "ai_dm"
                  ? "glow-gold border-[rgba(212,175,55,0.28)]"
                  : "opacity-55 border-[rgba(255,255,255,0.04)]"
              }`}
            >
              <h2
                className={`text-fantasy text-lg tracking-wide mb-2 ${
                  mode === "ai_dm"
                    ? "text-gold-rare"
                    : "text-[var(--color-silver-muted)]"
                }`}
              >
                AI Dungeon Master
              </h2>
              <p className="text-sm text-[var(--color-silver-muted)] leading-relaxed">
                An intelligent narrator guides your journey
              </p>
            </GlassCard>
          </button>

          <button
            type="button"
            onClick={() => setMode("human_dm")}
            className="text-left w-full min-h-[44px] rounded-[var(--radius-card)] transition-all duration-[var(--duration-med)] [transition-timing-function:var(--ease-out-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,255,255,0.2)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
          >
            <GlassCard
              className={`p-5 w-full transition-all duration-[var(--duration-med)] hover:shadow-[0_0_24px_rgba(255,255,255,0.06)] ${
                mode === "human_dm"
                  ? "glow-gold border-[rgba(212,175,55,0.28)]"
                  : "opacity-55 border-[rgba(255,255,255,0.04)]"
              }`}
            >
              <h2
                className={`text-fantasy text-lg tracking-wide mb-2 ${
                  mode === "human_dm"
                    ? "text-gold-rare"
                    : "text-[var(--color-silver-muted)]"
                }`}
              >
                Human Dungeon Master
              </h2>
              <p className="text-sm text-[var(--color-silver-dim)] leading-relaxed">
                One player commands the world
              </p>
            </GlassCard>
          </button>
        </div>

        {mode ? (
          <section className="w-full flex flex-col gap-[var(--void-gap)]">
            <GlassCard className="px-4 py-3 border-[rgba(255,255,255,0.06)]">
              <p className="text-xs text-[var(--color-silver-dim)] leading-relaxed">
                Choose a mode, set a campaign style, then create a session.
                Friends can join anytime with the six-character join code.
              </p>
            </GlassCard>
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--color-silver-dim)] mb-2">
                Campaign
              </p>
              <PillSelect
                options={CAMPAIGN_OPTIONS}
                value={campaignMode}
                onChange={setCampaignMode}
                size="md"
              />
            </div>

            {campaignMode === "user_prompt" ? (
              <div>
                <label
                  htmlFor="adventure-prompt"
                  className="text-xs uppercase tracking-wider text-[var(--color-silver-dim)] mb-2 block"
                >
                  Adventure prompt
                </label>
                <textarea
                  id="adventure-prompt"
                  value={adventurePrompt}
                  onChange={(e) => setAdventurePrompt(e.target.value)}
                  placeholder="Describe the tone, setting, or hook…"
                  rows={3}
                  className="w-full rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 py-3 text-[var(--color-silver-muted)] placeholder:text-[var(--color-silver-dim)] text-base min-h-[44px] resize-none focus:outline-none focus:border-[rgba(212,175,55,0.25)] focus:shadow-[0_0_20px_rgba(212,175,55,0.08)]"
                />
              </div>
            ) : null}

            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--color-silver-dim)] mb-2">
                Party size
              </p>
              <PillSelect
                options={PARTY_SIZES.map((n) => ({
                  value: String(n),
                  label: String(n),
                }))}
                value={String(maxPlayers)}
                onChange={(v) =>
                  setMaxPlayers(Number(v) as (typeof PARTY_SIZES)[number])
                }
                size="md"
              />
            </div>
          </section>
        ) : null}

        {createError ? (
          <p className="text-sm text-[var(--color-failure)] w-full text-center">
            {createError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 w-full mt-auto pt-2">
          <GoldButton
            type="button"
            size="lg"
            className="w-full min-h-[44px] flex items-center justify-center relative overflow-hidden"
            disabled={!mode || createLoading}
            onClick={handleCreate}
          >
            {createLoading ? (
              <span className="relative z-10">Opening portal…</span>
            ) : (
              <span className="relative z-10">Create Session</span>
            )}
            {createLoading ? (
              <span
                className="absolute inset-0 animate-shimmer opacity-40 pointer-events-none"
                aria-hidden
              />
            ) : null}
          </GoldButton>

          {joinOpen ? (
            <form
              onSubmit={handleJoinSubmit}
              className="flex flex-col gap-3 w-full"
            >
              <input
                key={joinShakeKey}
                type="text"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  setJoinError(null);
                }}
                placeholder="Join code"
                autoComplete="off"
                autoCapitalize="characters"
                className={`w-full min-h-[44px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.1)] px-4 text-[var(--color-silver-muted)] placeholder:text-[var(--color-silver-dim)] text-center text-data tracking-widest uppercase focus:outline-none focus:border-[rgba(212,175,55,0.3)] ${joinShakeKey > 0 ? "animate-shake-once" : ""}`}
              />
              <p className="text-[10px] text-[var(--color-silver-dim)] text-center">
                Example: 7G4K2M
              </p>
              {joinError ? (
                <p className="text-sm text-[var(--color-failure)] text-center">
                  {joinError}
                </p>
              ) : null}
              <GoldButton
                type="submit"
                size="lg"
                className="w-full min-h-[44px] flex items-center justify-center"
                disabled={joinLoading}
              >
                {joinLoading ? "Joining…" : "Enter"}
              </GoldButton>
            </form>
          ) : (
            <GhostButton
              type="button"
              size="lg"
              className="w-full min-h-[44px] flex items-center justify-center"
              onClick={() => {
                setJoinOpen(true);
                setJoinError(null);
                setJoinShakeKey(0);
              }}
            >
              Join with Code
            </GhostButton>
          )}
        </div>
      </div>
    </main>
  );
}
