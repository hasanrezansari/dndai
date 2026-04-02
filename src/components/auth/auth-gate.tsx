"use client";

import { AnimatePresence, motion } from "framer-motion";
import { signIn, useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { RouteLoadingUI } from "@/components/ui/route-loading";

const GUEST_STORAGE_KEY = "ashveil.guest_id";
const DISPLAY_NAME_STORAGE_KEY = "ashveil.display_name";

const SESSION_DISPLAY_PATH =
  /^\/session\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/display$/i;

/** NextAuth recovery (upgrade, bridge) — must render even when session drops mid-OAuth */
const AUTH_FLOW_PATH = /^\/auth\//;

const AUTH_ERROR_HINT: Record<string, string> = {
  OAuthCallbackError:
    "Google sign-in didn’t finish. You can try again or keep playing as a guest.",
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
  const displayToken = searchParams.get("t")?.trim() ?? "";
  const displayBypass =
    SESSION_DISPLAY_PATH.test(pathname) &&
    looksLikeSignedDisplayToken(displayToken);

  const { data: session, status } = useSession();
  const [guestId, setGuestId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Adventurer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoAttempted, setAutoAttempted] = useState(false);
  const hadSessionRef = useRef(false);

  useEffect(() => {
    if (session?.user?.id) hadSessionRef.current = true;
  }, [session?.user?.id]);

  useEffect(() => {
    if (displayBypass) return;
    if (status === "unauthenticated" && hadSessionRef.current) {
      hadSessionRef.current = false;
      setAutoAttempted(false);
    }
  }, [displayBypass, status]);

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
      setError("Could not sign in");
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

  const loading = displayBypass ? false : status === "loading" || !guestId;
  const isHome = pathname === "/" || pathname === "";
  const authFlowPath = AUTH_FLOW_PATH.test(pathname);
  const authErrorParam = searchParams.get("error")?.trim() ?? "";
  const oauthHint =
    AUTH_ERROR_HINT[authErrorParam] ?? AUTH_ERROR_HINT.Default;

  function clearOAuthParamsFromUrl() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("error");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    if (
      displayBypass ||
      loading ||
      session?.user?.id ||
      !guestId ||
      busy ||
      autoAttempted ||
      !displayName.trim()
    ) {
      return;
    }
    setAutoAttempted(true);
    void handleGuest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    displayBypass,
    loading,
    session?.user?.id,
    guestId,
    busy,
    autoAttempted,
    displayName,
  ]);

  const homeOauthBanner =
    isHome && authErrorParam ? (
      <div
        role="status"
        className="w-full max-w-md mx-auto mb-3 rounded-[var(--radius-card)] border border-[rgba(242,202,80,0.22)] bg-[var(--color-deep-void)]/90 px-4 py-3 text-center"
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

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        isHome && guestId ? (
          <motion.div
            key="loading-home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center w-full min-h-dvh"
          >
            {homeOauthBanner}
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
      ) : isHome ? (
        <motion.div
          key="home"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center w-full min-h-dvh"
        >
          {homeOauthBanner}
          {children}
        </motion.div>
      ) : displayBypass || authFlowPath || session?.user?.id ? (
        <motion.div
          key="app"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      ) : (
        <motion.div
          key="gate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="min-h-dvh flex flex-col items-center justify-center px-6 bg-[var(--color-obsidian)] gap-[var(--void-gap)]"
        >
          <GlassCard className="p-6 w-full max-w-sm border-[rgba(212,175,55,0.12)]">
            <p className="text-sm text-[var(--color-silver-dim)] mb-3">
              Choose how your name appears in party seats and the shared journal.
            </p>
            <label
              htmlFor="guest-name"
              className="text-xs uppercase tracking-wider text-[var(--color-silver-dim)] mb-2 block"
            >
              Display name
            </label>
            <input
              id="guest-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={48}
              className="w-full min-h-[44px] rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-[var(--color-silver-muted)] text-base mb-4 focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
            />
            <GoldButton
              type="button"
              size="lg"
              className="w-full min-h-[44px]"
              disabled={busy}
              onClick={() => void handleGuest()}
            >
              {busy ? "Entering…" : "Continue"}
            </GoldButton>
            {error ? (
              <p className="mt-3 text-sm text-[var(--color-failure)] text-center">
                {error}
              </p>
            ) : null}
          </GlassCard>
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
