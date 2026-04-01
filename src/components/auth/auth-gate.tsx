"use client";

import { AnimatePresence, motion } from "framer-motion";
import { signIn, useSession } from "next-auth/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { RouteLoadingUI } from "@/components/ui/route-loading";

const GUEST_STORAGE_KEY = "ashveil.guest_id";
const DISPLAY_NAME_STORAGE_KEY = "ashveil.display_name";

const SESSION_DISPLAY_PATH =
  /^\/session\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/display$/i;

function looksLikeSignedDisplayToken(t: string): boolean {
  const parts = t.split(".");
  if (parts.length !== 3) return false;
  return parts.every((p) => p.length > 0);
}

function AuthGateInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
    const res = await signIn("credentials", {
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
      ) : isHome ? (
        <motion.div
          key="home"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {children}
        </motion.div>
      ) : displayBypass || session?.user?.id ? (
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
