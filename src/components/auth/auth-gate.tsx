"use client";

import { AnimatePresence, motion } from "framer-motion";
import { getSession, signIn, signOut, useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { RouteLoadingUI } from "@/components/ui/route-loading";
import {
  clearOauthLinkPending,
  isOauthLinkPending,
  setOauthLinkPending,
} from "@/lib/auth/oauth-link-pending";
import { getBrandName, getBuildTimeBrand } from "@/lib/brand";

const GUEST_STORAGE_KEY = "ashveil.guest_id";
const DISPLAY_NAME_STORAGE_KEY = "ashveil.display_name";

const SESSION_DISPLAY_PATH =
  /^\/session\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/display$/i;

/** NextAuth recovery (upgrade, bridge) — must render even when session drops mid-OAuth */
const AUTH_FLOW_PATH = /^\/auth\//;

const AUTH_ERROR_HINT: Record<string, string> = {
  OAuthCallbackError:
    "Google sign-in didn’t finish. You can try again or play as a guest.",
  OAuthAccountNotLinked:
    "That Google account is already tied to another profile here, or an old session was still active. Try: hard refresh, then Create account with Google again — or use Link with Google only while logged in as the guest you want to save.",
  AccessDenied: "That Google account wasn’t used to sign in.",
  Callback: "Sign-in was interrupted. Try again when you’re ready.",
  Configuration:
    "Sign-in hit a server error (Auth.js often shows this for any internal failure — check Vercel logs, not only OAuth env vars). Try again in a moment.",
  Verification: "The sign-in link expired or was already used.",
  Default: "Sign-in didn’t complete. Try again or continue as a guest.",
};

function looksLikeSignedDisplayToken(t: string): boolean {
  const parts = t.split(".");
  if (parts.length !== 3) return false;
  return parts.every((p) => p.length > 0);
}

/** Guest session + persist display name; shared by entry button and PlayRomana auto-entry. */
async function performGuestSignIn(displayName: string): Promise<boolean> {
  const name = displayName.trim() || "Adventurer";
  let guestId: string;
  try {
    let id = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(GUEST_STORAGE_KEY, id);
    }
    guestId = id;
  } catch {
    guestId = crypto.randomUUID();
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, guestId);
    } catch {
      /* non-persistent guest for this tab only */
    }
  }
  const res = await signIn("guest", {
    guestId,
    displayName: name,
    redirect: false,
  });
  if (res?.error) return false;
  try {
    localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, name);
  } catch {
    /* ignore */
  }
  return true;
}

function AuthGateInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const authErrorParam = searchParams.get("error")?.trim() ?? "";
  const displayToken = searchParams.get("t")?.trim() ?? "";
  const displayBypass =
    SESSION_DISPLAY_PATH.test(pathname) &&
    looksLikeSignedDisplayToken(displayToken);
  const authFlowPath = AUTH_FLOW_PATH.test(pathname);

  const { data: session, status } = useSession();
  const brand = getBuildTimeBrand();
  const [displayName, setDisplayName] = useState("Adventurer");
  const [guestNameOpen, setGuestNameOpen] = useState(false);
  const [entryBusy, setEntryBusy] = useState<null | "guest" | "google">(null);
  const [error, setError] = useState<string | null>(null);
  /** PlayRomana: auto guest failed — show same entry card as Falvos for retry. */
  const [playromanaGuestFallback, setPlayromanaGuestFallback] =
    useState(false);
  const playromanaAutoGuestMounted = useRef(false);

  // Sync optional guest display name from storage (Falvos: before tapping Play as guest; PlayRomana: auto-entry).
  useEffect(() => {
    if (displayBypass) return;
    try {
      const savedName = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)?.trim();
      if (savedName) setDisplayName(savedName);
    } catch {
      /* ignore */
    }
  }, [displayBypass]);

  useEffect(() => {
    if (authErrorParam) clearOauthLinkPending();
  }, [authErrorParam]);

  const hasSessionUser =
    Boolean(session && "user" in session && session.user?.id) === true;

  useEffect(() => {
    if (hasSessionUser) clearOauthLinkPending();
  }, [hasSessionUser]);

  useEffect(() => {
    if (hasSessionUser && playromanaGuestFallback) {
      setPlayromanaGuestFallback(false);
    }
  }, [hasSessionUser, playromanaGuestFallback]);

  useEffect(() => {
    if (hasSessionUser) {
      playromanaAutoGuestMounted.current = false;
    }
  }, [hasSessionUser]);

  useEffect(() => {
    if (brand !== "playromana") return;
    if (displayBypass || authFlowPath) return;
    if (status !== "unauthenticated") return;
    if (playromanaGuestFallback) return;
    if (isOauthLinkPending()) return;
    if (playromanaAutoGuestMounted.current) return;
    playromanaAutoGuestMounted.current = true;

    let cancelled = false;
    void (async () => {
      let name = "Adventurer";
      try {
        const saved = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)?.trim();
        if (saved) name = saved;
      } catch {
        /* ignore */
      }
      const ok = await performGuestSignIn(name);
      if (cancelled) return;
      if (!ok) setPlayromanaGuestFallback(true);
    })();

    return () => {
      cancelled = true;
      playromanaAutoGuestMounted.current = false;
    };
  }, [
    brand,
    displayBypass,
    authFlowPath,
    status,
    playromanaGuestFallback,
  ]);

  async function handleGuest() {
    if (entryBusy) return;
    setEntryBusy("guest");
    setError(null);
    const ok = await performGuestSignIn(displayName);
    setEntryBusy(null);
    if (!ok) {
      setError("Could not start guest session.");
    }
  }

  async function handleGoogleOnly() {
    if (entryBusy) return;
    setEntryBusy("google");
    setError(null);
    try {
      // Clear any stale JWT (e.g. guest) before OAuth. Otherwise Auth.js can throw
      // OAuthAccountNotLinked: Google account belongs to user A but cookie was user B.
      setOauthLinkPending();
      await signOut({ redirect: false });
      for (let i = 0; i < 30; i++) {
        const s = await getSession();
        if (!s) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      await signIn("google", { callbackUrl: "/", redirect: true });
    } catch {
      clearOauthLinkPending();
      setError("Could not reach Google sign-in. Check your connection and try again.");
    } finally {
      setEntryBusy(null);
    }
  }

  const isHome = pathname === "/" || pathname === "";
  const oauthHint =
    AUTH_ERROR_HINT[authErrorParam] ?? AUTH_ERROR_HINT.Default;

  const needsEntryChoice =
    !displayBypass &&
    !authFlowPath &&
    status === "unauthenticated" &&
    !hasSessionUser &&
    (brand !== "playromana" || playromanaGuestFallback);

  const playromanaBlockingLoader =
    brand === "playromana" &&
    !displayBypass &&
    !authFlowPath &&
    status === "unauthenticated" &&
    !hasSessionUser &&
    !playromanaGuestFallback &&
    !isOauthLinkPending();

  const loading =
    displayBypass ? false : status === "loading" || playromanaBlockingLoader;

  /** After signOut, before Google redirect — avoid flashing entry / auto-guest. */
  const oauthLinkHandoff =
    isOauthLinkPending() &&
    !displayBypass &&
    !authFlowPath &&
    status === "unauthenticated" &&
    !hasSessionUser &&
    (brand !== "playromana" ? needsEntryChoice : !playromanaGuestFallback);

  function clearOAuthParamsFromUrl() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("error");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const oauthBanner =
    authErrorParam ? (
      <div
        role="status"
        className="w-full max-w-md mx-auto mb-4 rounded-[var(--radius-card)] border border-[rgba(242,202,80,0.22)] bg-[var(--color-deep-void)]/90 px-4 py-3 text-center"
      >
        <p className="text-xs text-[var(--color-silver-dim)] leading-relaxed">
          {oauthHint}
        </p>
        <button
          type="button"
          className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-gold-rare)] underline-offset-4 hover:underline"
          onClick={() => clearOAuthParamsFromUrl()}
        >
          Dismiss
        </button>
      </div>
    ) : null;

  const entryCard = (
    <motion.div
      key="entry"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="min-h-dvh flex flex-col items-center justify-center px-6 bg-[var(--color-obsidian)] gap-[var(--void-gap)] py-10"
    >
      {oauthBanner}
      <GlassCard className="p-6 w-full max-w-md border-[rgba(212,175,55,0.12)]">
        <p className="text-fantasy text-center text-xl font-bold text-[var(--color-gold-rare)] tracking-tight uppercase mb-1">
          {getBrandName(brand)}
        </p>
        <p className="text-xs text-center text-[var(--color-silver-dim)] mb-5 leading-relaxed">
          Play as a guest right away, or sign in with Google. On the home screen,
          guests can link progress to Google anytime.
        </p>

        <div className="grid grid-cols-2 gap-3 items-stretch mb-4">
          <GoldButton
            type="button"
            size="lg"
            className="min-h-[52px] h-full w-full px-2 py-3 text-[10px] sm:text-xs leading-tight whitespace-normal text-center"
            disabled={entryBusy !== null}
            aria-label="Play as guest without signing in"
            onClick={() => void handleGuest()}
          >
            {entryBusy === "guest" ? "Entering…" : "Play as guest"}
          </GoldButton>
          <GoogleSignInButton
            disabled={entryBusy !== null}
            onClick={() => void handleGoogleOnly()}
            label="Create account"
            stacked
            className="h-full min-h-[52px] min-w-0"
          />
        </div>

        <button
          type="button"
          className="w-full text-center text-[10px] uppercase tracking-[0.14em] text-[var(--outline)] hover:text-[var(--color-gold-rare)] transition-colors py-1"
          onClick={() => setGuestNameOpen((o) => !o)}
          aria-expanded={guestNameOpen}
        >
          {guestNameOpen ? "Hide guest name" : "Guest display name (optional)"}
        </button>
        {guestNameOpen ? (
          <div className="mt-2">
            <label
              htmlFor="gate-guest-name"
              className="sr-only"
            >
              Guest display name
            </label>
            <input
              id="gate-guest-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={48}
              placeholder="Adventurer"
              className="w-full min-h-[44px] rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-[var(--color-silver-muted)] text-sm focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
            />
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-[var(--color-failure)] text-center leading-relaxed">
            {error}
          </p>
        ) : null}
      </GlassCard>
    </motion.div>
  );

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        authFlowPath ? (
          <motion.div
            key="loading-auth-flow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="min-h-dvh"
          >
            {children}
          </motion.div>
        ) : (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <RouteLoadingUI />
          </motion.div>
        )
      ) : oauthLinkHandoff ? (
        <motion.div
          key="oauth-link-handoff"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="min-h-dvh flex flex-col items-center justify-center px-6 bg-[var(--color-obsidian)] gap-5"
          role="status"
          aria-live="polite"
          aria-label="Opening Google sign-in"
        >
          <div
            className="h-11 w-11 rounded-full border-2 border-[rgba(242,202,80,0.25)] border-t-[var(--color-gold-rare)] animate-spin"
            aria-hidden
          />
          <p className="text-xs text-center text-[var(--color-silver-dim)] uppercase tracking-[0.14em] max-w-xs leading-relaxed">
            Continuing to Google…
          </p>
        </motion.div>
      ) : needsEntryChoice ? (
        entryCard
      ) : isHome ? (
        <motion.div
          key="home"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center w-full min-h-dvh"
        >
          {authErrorParam ? oauthBanner : null}
          {children}
        </motion.div>
      ) : (
        <motion.div
          key="app"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="min-h-dvh flex flex-col bg-[var(--color-obsidian)]"
        >
          <RouteLoadingUI />
        </motion.div>
      }
    >
      <AuthGateInner>{children}</AuthGateInner>
    </Suspense>
  );
}
