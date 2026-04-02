"use client";

import { AnimatePresence, motion } from "framer-motion";
import { signIn, useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { RouteLoadingUI } from "@/components/ui/route-loading";
import { getBrandName, getBuildTimeBrand } from "@/lib/brand";

const GUEST_STORAGE_KEY = "ashveil.guest_id";
const DISPLAY_NAME_STORAGE_KEY = "ashveil.display_name";

const SESSION_DISPLAY_PATH =
  /^\/session\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/display$/i;

/** NextAuth recovery (upgrade, bridge) — must render even when session drops mid-OAuth */
const AUTH_FLOW_PATH = /^\/auth\//;

const SKIP_GUEST_UNTIL_KEY = "ashveil.skip_guest_until";

const AUTH_ERROR_HINT: Record<string, string> = {
  OAuthCallbackError:
    "Google sign-in didn’t finish. You can try again or play as a guest.",
  OAuthAccountNotLinked:
    "That Google account couldn’t be linked this time. Try again or play as a guest first.",
  AccessDenied: "That Google account wasn’t used to sign in.",
  Callback: "Sign-in was interrupted. Try again when you’re ready.",
  Configuration:
    "Sign-in isn’t configured correctly on the server. Check Google OAuth env vars.",
  Verification: "The sign-in link expired or was already used.",
  Default: "Sign-in didn’t complete. Try again or continue as a guest.",
};

function looksLikeSignedDisplayToken(t: string): boolean {
  const parts = t.split(".");
  if (parts.length !== 3) return false;
  return parts.every((p) => p.length > 0);
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

  const { data: session, status } = useSession();
  const brand = getBuildTimeBrand();
  const [guestId, setGuestId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Adventurer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    const email = session.user?.email;
    if (
      typeof email === "string" &&
      email.endsWith("@ashveil.guest")
    ) {
      return;
    }
    try {
      sessionStorage.removeItem(SKIP_GUEST_UNTIL_KEY);
    } catch {
      /* ignore */
    }
  }, [session?.user?.id, session?.user?.email]);

  useEffect(() => {
    if (!authErrorParam) return;
    try {
      sessionStorage.removeItem(SKIP_GUEST_UNTIL_KEY);
    } catch {
      /* ignore */
    }
  }, [authErrorParam]);

  useEffect(() => {
    if (displayBypass) return;
    try {
      let id = localStorage.getItem(GUEST_STORAGE_KEY);
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        id = crypto.randomUUID();
        localStorage.setItem(GUEST_STORAGE_KEY, id);
      }
      const savedName = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)?.trim();
      if (savedName) setDisplayName(savedName);
      setGuestId(id);
    } catch {
      setGuestId(crypto.randomUUID());
    }
  }, [displayBypass]);

  async function handleGuest() {
    if (!guestId || busy) return;
    setBusy(true);
    setError(null);
    const res = await signIn("guest", {
      guestId,
      displayName: displayName.trim() || "Adventurer",
      redirect: false,
    });
    setBusy(false);
    if (res?.error) {
      setError("Could not start guest session.");
      return;
    }
    try {
      localStorage.setItem(
        DISPLAY_NAME_STORAGE_KEY,
        displayName.trim() || "Adventurer",
      );
    } catch {
      /* ignore */
    }
  }

  async function handleGoogleOnly() {
    setBusy(true);
    setError(null);
    try {
      await signIn("google", { callbackUrl: "/" });
    } finally {
      setBusy(false);
    }
  }

  const loading = displayBypass ? false : status === "loading" || !guestId;
  const isHome = pathname === "/" || pathname === "";
  const authFlowPath = AUTH_FLOW_PATH.test(pathname);
  const oauthHint =
    AUTH_ERROR_HINT[authErrorParam] ?? AUTH_ERROR_HINT.Default;

  const hasSessionUser =
    Boolean(session && "user" in session && session.user?.id) === true;

  const needsEntryChoice =
    !displayBypass &&
    !authFlowPath &&
    status === "unauthenticated" &&
    !hasSessionUser;

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
      <GlassCard className="p-6 w-full max-w-sm border-[rgba(212,175,55,0.12)]">
        <p className="text-fantasy text-center text-xl font-bold text-[var(--color-gold-rare)] tracking-tight uppercase mb-1">
          {getBrandName(brand)}
        </p>
        <p className="text-xs text-center text-[var(--color-silver-dim)] mb-6 leading-relaxed">
          Play as a guest instantly, or sign in with Google. If you play as a
          guest first, use{" "}
          <span className="text-[var(--color-silver-muted)]">
            Link with Google
          </span>{" "}
          on the home screen later — your progress moves to your Google account.
        </p>
        <label
          htmlFor="gate-guest-name"
          className="text-xs uppercase tracking-wider text-[var(--color-silver-dim)] mb-2 block"
        >
          Display name (guest)
        </label>
        <input
          id="gate-guest-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={48}
          className="w-full min-h-[44px] rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-[var(--color-silver-muted)] text-base mb-4 focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
        />
        <GoldButton
          type="button"
          size="lg"
          className="w-full min-h-[48px] mb-3"
          disabled={busy || !displayName.trim()}
          onClick={() => void handleGuest()}
        >
          {busy ? "Entering…" : "Play as guest"}
        </GoldButton>
        <p className="text-center text-[10px] uppercase tracking-[0.2em] text-[var(--outline)] mb-3">
          or
        </p>
        <GoogleSignInButton
          disabled={busy}
          onClick={() => void handleGoogleOnly()}
          label="Continue with Google"
        />
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
