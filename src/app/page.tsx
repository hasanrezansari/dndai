"use client";

import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { COPY } from "@/lib/copy/ashveil";
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
  const [tutorialComplete, setTutorialComplete] = useState<boolean>(false);
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

  useEffect(() => {
    try {
      setTutorialComplete(
        window.localStorage.getItem("falvos.tutorial.complete") === "1",
      );
    } catch {
      setTutorialComplete(false);
    }
  }, []);

  async function handleUpgradeToGoogle() {
    try {
      await fetch("/api/auth/upgrade/prepare", { method: "POST" });
    } catch {
      // Ignore; upgrade page will show error if missing context.
    }
    await signIn("google", { callbackUrl: "/auth/upgrade" });
  }

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

  const isGuest =
    typeof authSession?.user?.email === "string" &&
    authSession.user.email.endsWith("@ashveil.guest");

  const GoogleIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 48 48"
      aria-hidden
      className="shrink-0"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.72 1.22 9.23 3.6l6.9-6.9C35.95 2.38 30.37 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.03 6.24C12.45 13.06 17.77 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.64-.15-3.21-.43-4.73H24v9.0h12.4c-.54 2.9-2.18 5.36-4.65 7.02l7.18 5.57C43.22 37.38 46.1 31.55 46.1 24.5z"
      />
      <path
        fill="#FBBC05"
        d="M10.59 28.46c-.5-1.5-.78-3.1-.78-4.76s.28-3.26.78-4.76l-8.03-6.24C.92 16.0 0 19.86 0 23.7s.92 7.7 2.56 11.0l8.03-6.24z"
      />
      <path
        fill="#34A853"
        d="M24 47.4c6.37 0 11.74-2.1 15.65-5.72l-7.18-5.57c-1.99 1.34-4.54 2.13-8.47 2.13-6.23 0-11.55-3.56-13.41-8.72l-8.03 6.24C6.51 42.02 14.62 47.4 24 47.4z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );

  if (authStatus === "loading") {
    return (
      <main className="min-h-dvh flex flex-col items-center px-6 pt-16 pb-8 bg-[var(--color-obsidian)]">
        <div className="flex flex-col items-center gap-[var(--void-gap-lg)] w-full max-w-md">
          <header className="text-center flex flex-col gap-3 mt-6">
            <h1 className="text-fantasy text-4xl font-bold text-[var(--color-gold-rare)] tracking-[0.15em] uppercase">
              FALVOS
            </h1>
            <p className="text-[var(--color-silver-dim)] text-sm italic tracking-wide font-serif">
              &ldquo;{COPY.tagline}&rdquo;
            </p>
          </header>
          <ModeCardsSkeleton />
          <p className="text-[10px] text-[var(--color-silver-dim)] text-center uppercase tracking-[0.2em]">
            Consulting the Archivist...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col items-center px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] bg-[var(--color-obsidian)]">
      <div className="flex flex-col gap-[var(--void-gap)] w-full max-w-md pt-8">
        {/* Brand */}
        <header className="relative overflow-hidden rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.18)] bg-[var(--surface-container)]/25 p-6">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute -top-16 -left-24 h-56 w-56 rounded-full bg-[rgba(212,175,55,0.10)] blur-3xl" />
            <div className="absolute -bottom-20 -right-28 h-72 w-72 rounded-full bg-[rgba(120,74,32,0.18)] blur-3xl" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--color-obsidian)]" />
          </div>

          <div className="relative text-center flex flex-col gap-2">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--outline)]">
              Multiplayer AI tabletop
            </p>
            <h1 className="text-fantasy text-4xl font-black text-[var(--color-gold-rare)] tracking-tight uppercase">
              FALVOS
            </h1>
            <p className="text-[var(--color-silver-dim)] text-sm italic tracking-wide font-serif">
              &ldquo;{COPY.tagline}&rdquo;
            </p>

            <div className="mt-3 flex items-center justify-center gap-2">
              <Link
                href="/profile"
                className="min-h-[38px] px-3.5 rounded-[var(--radius-chip)] border border-[rgba(255,255,255,0.10)] bg-gradient-to-b from-[rgba(255,255,255,0.06)] to-[rgba(0,0,0,0.14)] text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-silver-dim)] hover:text-[var(--color-gold-rare)] hover:border-[rgba(242,202,80,0.28)] transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-sm">person</span>
                  Profile
                </span>
              </Link>
              <Link
                href="/adventures"
                className="min-h-[38px] px-3.5 rounded-[var(--radius-chip)] border border-[rgba(255,255,255,0.10)] bg-gradient-to-b from-[rgba(255,255,255,0.06)] to-[rgba(0,0,0,0.14)] text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-silver-dim)] hover:text-[var(--color-gold-rare)] hover:border-[rgba(242,202,80,0.28)] transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-sm">travel_explore</span>
                  Adventures
                </span>
              </Link>
              <Link
                href="/tv"
                className="min-h-[38px] px-3.5 rounded-[var(--radius-chip)] border border-[rgba(255,255,255,0.10)] bg-gradient-to-b from-[rgba(255,255,255,0.06)] to-[rgba(0,0,0,0.14)] text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-silver-dim)] hover:text-[var(--color-gold-rare)] hover:border-[rgba(242,202,80,0.28)] transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-sm">tv</span>
                  TV
                </span>
              </Link>
            </div>

            {authSession?.user?.name ? (
              <div className="mt-2 flex flex-col items-center gap-2">
                <p className="text-[10px] text-[var(--outline)] uppercase tracking-[0.18em]">
                  Welcome, {authSession.user.name}
                  {isGuest ? " (Guest)" : ""}
                </p>
                {isGuest ? (
                  <GhostButton
                    type="button"
                    size="sm"
                    className="min-h-[36px]"
                    onClick={() => void handleUpgradeToGoogle()}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {GoogleIcon}
                      Sign in with Google
                    </span>
                  </GhostButton>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        {/* Mode Selection */}
        <section className="space-y-4">
          {!tutorialComplete ? (
            <Link
              href="/tutorial"
              className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.25)] bg-[var(--surface-container)]/40 text-[var(--color-silver-muted)] text-[10px] font-bold uppercase tracking-[0.14em] hover:border-[var(--color-gold-rare)]/30 hover:text-[var(--color-gold-rare)] transition-colors"
            >
              <span className="material-symbols-outlined text-lg">school</span>
              Start tutorial
            </Link>
          ) : null}
          <div className="flex items-center gap-3 mb-2">
            <span className="w-1.5 h-6 bg-[var(--color-gold-rare)]" />
            <h2 className="text-fantasy font-bold text-base uppercase tracking-[0.12em] text-[var(--color-silver-dim)]">
              Select Master Presence
            </h2>
          </div>

          {/* AI DM Card */}
          <button
            type="button"
            onClick={() => setMode("ai_dm")}
            className="text-left w-full min-h-[44px] transition-all duration-200 active:scale-[0.98] focus:outline-none"
          >
            <div
              className={`relative h-44 rounded-[var(--radius-card)] p-6 flex flex-col justify-end overflow-hidden transition-all duration-300 ${
                mode === "ai_dm"
                  ? "bg-[var(--surface-high)] selected-glow metallic-edge"
                  : "bg-[var(--color-midnight)] border border-[rgba(77,70,53,0.2)] opacity-70 hover:opacity-100 hover:bg-[var(--surface-container)]"
              }`}
            >
              <div className="relative z-10 flex items-start justify-between gap-3 mb-auto">
                <div className="min-h-[24px] px-2 rounded-[var(--radius-chip)] border border-white/10 bg-black/20 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">
                    auto_awesome
                  </span>
                  AI
                </div>
                <div className="h-10 w-10 rounded-[var(--radius-avatar)] border border-white/10 bg-black/20 grid place-items-center text-[var(--outline)]">
                  <span className="material-symbols-outlined text-base">
                    image
                  </span>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 opacity-70">
                <div className="absolute inset-0 bg-gradient-to-br from-[rgba(242,202,80,0.18)] via-transparent to-[rgba(123,45,142,0.16)]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-[var(--color-obsidian)]/30 to-transparent" />
              </div>
              {mode === "ai_dm" && (
                <div className="relative flex items-center gap-2 mb-1">
                  <span
                    className="material-symbols-outlined text-[var(--color-gold-rare)] text-sm"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    auto_awesome
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-gold-rare)]">
                    Active Selection
                  </span>
                </div>
              )}
              <div className="relative">
                <h3 className="text-fantasy font-bold text-xl text-[var(--color-silver-muted)]">
                AI Dungeon Master
                </h3>
                <p className="text-xs text-[var(--color-silver-dim)] leading-relaxed mt-1">
                Boundless worlds generated in real-time by the obsidian core.
                </p>
              </div>
            </div>
          </button>

          {/* Human DM Card */}
          <button
            type="button"
            onClick={() => setMode("human_dm")}
            className="text-left w-full min-h-[44px] transition-all duration-200 active:scale-[0.98] focus:outline-none"
          >
            <div
              className={`relative h-44 rounded-[var(--radius-card)] p-6 flex flex-col justify-end overflow-hidden transition-all duration-300 ${
                mode === "human_dm"
                  ? "bg-[var(--surface-high)] selected-glow metallic-edge"
                  : "bg-[var(--color-midnight)] border border-[rgba(77,70,53,0.2)] opacity-70 hover:opacity-100 hover:bg-[var(--surface-container)]"
              }`}
            >
              <div className="relative z-10 flex items-start justify-between gap-3 mb-auto">
                <div className="min-h-[24px] px-2 rounded-[var(--radius-chip)] border border-white/10 bg-black/20 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">handshake</span>
                  Human
                </div>
                <div className="h-10 w-10 rounded-[var(--radius-avatar)] border border-white/10 bg-black/20 grid place-items-center text-[var(--outline)]">
                  <span className="material-symbols-outlined text-base">
                    image
                  </span>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 opacity-70">
                <div className="absolute inset-0 bg-gradient-to-br from-[rgba(242,202,80,0.10)] via-transparent to-[rgba(139,37,0,0.22)]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-[var(--color-obsidian)]/30 to-transparent" />
              </div>
              {mode === "human_dm" && (
                <div className="relative flex items-center gap-2 mb-1">
                  <span
                    className="material-symbols-outlined text-[var(--color-gold-rare)] text-sm"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    auto_awesome
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-gold-rare)]">
                    Active Selection
                  </span>
                </div>
              )}
              <div className="relative">
                <h3 className="text-fantasy font-bold text-xl text-[var(--color-silver-muted)]">
                  Human Dungeon Master
                </h3>
                <p className="text-xs text-[var(--color-silver-dim)] leading-relaxed mt-1">
                  Host a session for your party with manual control and custom lore.
                </p>
              </div>
            </div>
          </button>
        </section>

        {/* Configuration */}
        {mode ? (
          <section className="space-y-8 animate-fade-in">
            {/* Campaign Pills */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--outline)] mb-4">
                Origin Method
              </label>
              <PillSelect
                options={CAMPAIGN_OPTIONS}
                value={campaignMode}
                onChange={setCampaignMode}
                size="md"
              />
            </div>

            {/* Adventure Prompt */}
            {campaignMode === "user_prompt" ? (
              <div>
                <label
                  htmlFor="adventure-prompt"
                  className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--outline)] mb-4"
                >
                  The Narrative Seed
                </label>
                <textarea
                  id="adventure-prompt"
                  value={adventurePrompt}
                  onChange={(e) => setAdventurePrompt(e.target.value)}
                  placeholder="Describe your adventure..."
                  rows={4}
                  maxLength={500}
                  className="w-full h-36 bg-[var(--color-deep-void)] p-5 rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] focus:border-[var(--color-gold-rare)]/50 focus:ring-0 text-[var(--color-silver-muted)] font-serif italic text-base leading-relaxed placeholder:text-[var(--outline)]/40 resize-none transition-all"
                />
              </div>
            ) : null}

            {/* Party Size */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--outline)] mb-4">
                Fellowship Count
              </label>
              <div className="flex items-center bg-[var(--color-midnight)] p-1.5 rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.1)]">
                {PARTY_SIZES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxPlayers(n)}
                    className={`flex-1 min-h-[44px] py-3 font-black text-sm transition-all duration-200 rounded-[var(--radius-card)] ${
                      maxPlayers === n
                        ? "bg-[var(--color-gold-rare)] text-[var(--color-obsidian)] shadow-lg shadow-[rgba(242,202,80,0.2)] scale-105 z-10"
                        : "text-[var(--outline)] hover:text-[var(--color-silver-muted)]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* Error */}
        {createError ? (
          <div className="bg-[var(--color-failure)]/10 border-l-4 border-[var(--color-failure)] p-3 rounded-r-[var(--radius-card)]">
            <p className="text-sm text-[var(--color-failure)]">
              {createError}
            </p>
          </div>
        ) : null}

        {/* Bottom actions (not floating) */}
        <section className="mt-2 rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.25)] bg-[var(--surface-high)]/60 backdrop-blur-md p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="flex flex-col gap-3">
            <GoldButton
              type="button"
              size="lg"
              className="w-full min-h-[56px] flex items-center justify-center gap-3 relative overflow-hidden text-lg"
              disabled={!mode || createLoading}
              onClick={handleCreate}
            >
              {createLoading ? (
                <>
                  <span>Opening portal…</span>
                  <span
                    className="absolute inset-0 animate-shimmer opacity-40 pointer-events-none"
                    aria-hidden
                  />
                </>
              ) : (
                <>
                  <span>Create Session</span>
                  <span className="material-symbols-outlined text-lg">swords</span>
                </>
              )}
            </GoldButton>

            {joinOpen ? (
              <form onSubmit={handleJoinSubmit} className="flex flex-col gap-3 w-full">
                <div className="text-center mb-2">
                  <h3 className="text-fantasy text-xl text-[var(--color-silver-muted)] tracking-tight">
                    Summoning Ritual
                  </h3>
                  <p className="text-[var(--color-silver-dim)] text-xs mt-1">
                    Enter the ancient cipher to join your party.
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-gold-rare)]/70 mb-2 ml-1">
                    Join Code
                  </label>
                  <input
                    key={joinShakeKey}
                    type="text"
                    value={joinCode}
                    onChange={(e) => {
                      setJoinCode(e.target.value.toUpperCase());
                      setJoinError(null);
                    }}
                    placeholder="A7-G42"
                    autoComplete="off"
                    autoCapitalize="characters"
                    maxLength={8}
                    className={`w-full h-16 bg-[var(--color-deep-void)] border-none text-center text-2xl font-serif tracking-[0.3em] text-[var(--color-gold-rare)] placeholder:text-[var(--outline)]/40 rounded-[var(--radius-card)] focus:ring-1 focus:ring-[var(--color-failure)]/50 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)] transition-all uppercase ${joinShakeKey > 0 ? "animate-shake-once" : ""}`}
                  />
                </div>
                {joinError ? (
                  <p className="text-sm text-[var(--color-failure)] text-center">
                    {joinError}
                  </p>
                ) : null}
                <GoldButton
                  type="submit"
                  size="lg"
                  className="w-full min-h-[48px] flex items-center justify-center gap-3"
                  disabled={joinLoading}
                >
                  <span>{joinLoading ? "Joining…" : "Enter Portal"}</span>
                  {!joinLoading && (
                    <span className="material-symbols-outlined text-lg">
                      login
                    </span>
                  )}
                </GoldButton>
                <button
                  type="button"
                  onClick={() => {
                    setJoinOpen(false);
                    setJoinError(null);
                  }}
                  className="w-full py-2 text-[var(--color-silver-dim)] hover:text-[var(--color-gold-rare)] text-xs uppercase tracking-[0.15em] transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">
                    arrow_back
                  </span>
                  Back to Create Session
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex-1 min-h-[44px] rounded-[var(--radius-card)] border border-white/10 bg-black/10 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-silver-dim)] hover:text-[var(--color-gold-rare)] hover:border-[var(--color-gold-rare)]/25 transition-colors"
                  onClick={() => {
                    setJoinOpen(true);
                    setJoinError(null);
                    setJoinShakeKey(0);
                  }}
                >
                  Join with code
                </button>
                <Link
                  href="/tv"
                  className="flex-1 min-h-[44px] rounded-[var(--radius-card)] border border-white/10 bg-black/10 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-silver-dim)] hover:text-[var(--color-gold-rare)] hover:border-[var(--color-gold-rare)]/25 transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">tv</span>
                  TV
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
