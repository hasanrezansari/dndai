"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { getBrandName, getBrandTagline, getBuildTimeBrand } from "@/lib/brand";
import { ROMA_MODULES } from "@/lib/rome/modules";
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
  const brand = getBuildTimeBrand();
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
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeBusy, setUpgradeBusy] = useState(false);

  const isGuest =
    typeof authSession?.user?.email === "string" &&
    authSession.user.email.endsWith("@ashveil.guest");

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
    setUpgradeError(null);
    setUpgradeBusy(true);
    let prepareRes: Response;
    try {
      prepareRes = await fetch("/api/auth/upgrade/prepare", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      setUpgradeError(
        "Could not start Google sign-in. Check your connection and try again.",
      );
      setUpgradeBusy(false);
      return;
    }
    if (!prepareRes.ok) {
      const data: unknown = await prepareRes.json().catch(() => ({}));
      const msg =
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : "Could not prepare account upgrade. Refresh the page and try again.";
      setUpgradeError(msg);
      setUpgradeBusy(false);
      return;
    }
    // Guest JWT + existing Google account can confuse OAuth linking; clear session before OAuth.
    try {
      const until = Date.now() + 3 * 60 * 1000;
      window.sessionStorage.setItem("ashveil.skip_guest_until", String(until));
    } catch {
      /* ignore */
    }
    try {
      await signOut({ redirect: false });
      // Client signIn() can start OAuth before the browser applies Set-Cookie from
      // signOut. The OAuth callback then still carries the guest JWT, and Auth.js
      // throws OAuthAccountNotLinked (Google account belongs to another user id).
      // Full navigation forces a new request after the session cookie is cleared.
      const callbackUrl = `${window.location.origin}/auth/upgrade`;
      window.location.assign(
        `/api/auth/signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`,
      );
    } finally {
      setUpgradeBusy(false);
    }
  }

  async function handleCreate() {
    if (!mode || createLoading) return;
    return handleCreateWithOptions({});
  }

  async function handleCreateWithOptions(options: {
    forceMode?: SessionMode;
    forceCampaignMode?: CampaignMode;
    forceModuleKey?: string;
  }) {
    const effectiveMode = options.forceMode ?? mode;
    if (!effectiveMode || createLoading) return;
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
        mode: effectiveMode,
        campaignMode: options.forceCampaignMode ?? campaignMode,
        maxPlayers,
      };
      if (
        (options.forceCampaignMode ?? campaignMode) === "user_prompt" &&
        adventurePrompt.trim()
      ) {
        body.adventurePrompt = adventurePrompt.trim();
      }
      if ((options.forceCampaignMode ?? campaignMode) === "module") {
        body.moduleKey = options.forceModuleKey ?? "module_remix_default";
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
      <main className="min-h-dvh flex flex-col items-center px-6 pt-16 pb-8 bg-[var(--color-obsidian)]">
        <div className="flex flex-col items-center gap-[var(--void-gap-lg)] w-full max-w-md">
          <header className="text-center flex flex-col gap-3 mt-6">
            <h1 className="text-fantasy text-4xl font-bold text-[var(--color-gold-rare)] tracking-[0.15em] uppercase">
              {getBrandName(brand)}
            </h1>
            <p className="text-[var(--color-silver-dim)] text-sm italic tracking-wide font-serif">
              &ldquo;{getBrandTagline(brand)}&rdquo;
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

  if (brand === "playromana") {
    return (
      <main className="min-h-dvh flex flex-col items-center px-6 pb-8 bg-[var(--color-obsidian)]">
        <div className="flex flex-col gap-[var(--void-gap-lg)] w-full max-w-md pt-10">
          <header className="text-center flex flex-col gap-2">
            <h1 className="text-fantasy text-4xl font-black text-[var(--color-gold-rare)] tracking-tight uppercase">
              {getBrandName(brand)}
            </h1>
            <p className="text-[var(--color-silver-dim)] text-sm italic tracking-wide font-serif">
              &ldquo;{getBrandTagline(brand)}&rdquo;
            </p>
            {authSession?.user?.name ? (
              <div className="flex flex-col items-center gap-2 mt-1">
                <p className="text-[10px] text-[var(--outline)] uppercase tracking-[0.15em]">
                  Welcome, {authSession.user.name}
                  {isGuest ? " (Guest)" : ""}
                </p>
                <Link
                  href="/profile"
                  className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-silver-dim)] underline decoration-[rgba(212,175,55,0.25)] underline-offset-4 hover:text-[var(--color-gold-rare)]"
                >
                  Edit profile
                </Link>
                {isGuest ? (
                  <div className="w-full max-w-[240px] mx-auto flex flex-col gap-2">
                    <GoogleSignInButton
                      disabled={upgradeBusy}
                      onClick={() => void handleUpgradeToGoogle()}
                      label={
                        upgradeBusy ? "Linking…" : "Link progress with Google"
                      }
                    />
                    <p className="text-[9px] text-[var(--outline)] text-center leading-relaxed">
                      Moves this guest&apos;s games to your Google account.
                    </p>
                    {upgradeError ? (
                      <p className="text-xs text-[var(--color-failure)] text-center leading-relaxed">
                        {upgradeError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </header>

          <section className="space-y-5">
            <div className="flex items-center gap-3 mb-1">
              <span className="w-1.5 h-6 bg-[var(--color-gold-rare)]" />
              <h2 className="text-fantasy font-bold text-base uppercase tracking-[0.12em] text-[var(--color-silver-dim)]">
                Choose a Roman Story
              </h2>
            </div>

            <div className="grid gap-4">
              {ROMA_MODULES.map((m) => (
                <div
                  key={m.key}
                  className="rounded-[var(--radius-card)] p-5 bg-[var(--surface-high)] border border-[rgba(77,70,53,0.25)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-fantasy text-lg font-bold text-[var(--color-silver-muted)] tracking-tight">
                        {m.title}
                      </h3>
                      <p className="text-xs text-[var(--color-silver-dim)] leading-relaxed mt-1">
                        {m.pitch}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {m.tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.18em] bg-[var(--color-deep-void)] text-[var(--outline)] border border-[rgba(255,255,255,0.08)]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <GoldButton
                      type="button"
                      size="md"
                      className="shrink-0 min-h-[44px] px-4"
                      disabled={createLoading}
                      onClick={() =>
                        void handleCreateWithOptions({
                          forceMode: "ai_dm",
                          forceCampaignMode: "module",
                          forceModuleKey: m.key,
                        })
                      }
                    >
                      {createLoading ? "Opening…" : "Start"}
                    </GoldButton>
                  </div>
                </div>
              ))}
            </div>

            {createError ? (
              <div className="bg-[var(--color-failure)]/10 border-l-4 border-[var(--color-failure)] p-3 rounded-r-[var(--radius-card)]">
                <p className="text-sm text-[var(--color-failure)]">
                  {createError}
                </p>
              </div>
            ) : null}

            <div className="rounded-[var(--radius-card)] p-4 bg-[var(--color-midnight)] border border-[rgba(77,70,53,0.18)]">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                No prompts. No setup.
              </p>
              <p className="text-xs text-[var(--color-silver-dim)] mt-2 leading-relaxed">
                Pick a story and begin. Invite friends from the lobby once your
                portal opens.
              </p>
            </div>

            <GhostButton
              type="button"
              size="lg"
              className="w-full min-h-[48px]"
              onClick={async () => {
                try {
                  const res = await fetch("/api/auth/bridge-token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ returnTo: "/adventures" }),
                  });
                  const data: unknown = await res.json().catch(() => ({}));
                  if (
                    res.ok &&
                    typeof data === "object" &&
                    data !== null &&
                    "redirectUrl" in data &&
                    typeof (data as { redirectUrl: unknown }).redirectUrl ===
                      "string"
                  ) {
                    window.location.href = (data as { redirectUrl: string }).redirectUrl;
                    return;
                  }
                } catch {
                  // best effort
                }
                window.location.href = "https://playdndai.com/adventures";
              }}
            >
              Explore other worlds
            </GhostButton>

            {joinOpen ? (
              <form
                onSubmit={handleJoinSubmit}
                className="flex flex-col gap-4 w-full bg-[var(--surface-high)] rounded-[var(--radius-card)] p-6 border border-[rgba(77,70,53,0.3)] animate-slide-up"
              >
                <div className="text-center mb-2">
                  <h3 className="text-fantasy text-xl text-[var(--color-silver-muted)] tracking-tight">
                    Join a Party
                  </h3>
                  <p className="text-[var(--color-silver-dim)] text-xs mt-1">
                    Enter the cipher to join your friends.
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
                  <span>{joinLoading ? "Joining…" : "Enter"}</span>
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
                  Back
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 py-3 group transition-colors"
                onClick={() => {
                  setJoinOpen(true);
                  setJoinError(null);
                  setJoinShakeKey(0);
                }}
              >
                <span className="text-[var(--outline)] text-[10px] font-bold uppercase tracking-[0.15em] group-hover:text-[var(--color-gold-rare)] transition-colors">
                  Have a join code?
                </span>
                <span className="text-[var(--color-gold-rare)] font-black uppercase text-xs tracking-[0.1em] border-b border-[var(--color-gold-rare)]/20 group-hover:border-[var(--color-gold-rare)] transition-all pb-0.5">
                  Join
                </span>
              </button>
            )}
          </section>
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
              {getBrandName(brand)}
            </h1>
            <p className="text-[var(--color-silver-dim)] text-sm italic tracking-wide font-serif">
              &ldquo;{getBrandTagline(brand)}&rdquo;
            </p>

            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
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
                  <div className="w-full max-w-[240px] mx-auto flex flex-col gap-2">
                    <GoogleSignInButton
                      disabled={upgradeBusy}
                      onClick={() => void handleUpgradeToGoogle()}
                      label={
                        upgradeBusy ? "Linking…" : "Link progress with Google"
                      }
                    />
                    <p className="text-[9px] text-[var(--outline)] text-center leading-relaxed">
                      Moves this guest&apos;s games to your Google account.
                    </p>
                    {upgradeError ? (
                      <p className="text-xs text-[var(--color-failure)] text-center leading-relaxed">
                        {upgradeError}
                      </p>
                    ) : null}
                  </div>
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
