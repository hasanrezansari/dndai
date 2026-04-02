"use client";

import { getSession, signIn, signOut } from "next-auth/react";

import { clearOauthLinkPending, setOauthLinkPending } from "@/lib/auth/oauth-link-pending";

export async function runGuestGoogleUpgradeFlow(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  let prepareRes: Response;
  try {
    prepareRes = await fetch("/api/auth/upgrade/prepare", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    return {
      ok: false,
      error:
        "Could not start Google sign-in. Check your connection and try again.",
    };
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
    return { ok: false, error: msg };
  }
  try {
    setOauthLinkPending();
    await signOut({ redirect: false });
    for (let i = 0; i < 30; i++) {
      const s = await getSession();
      if (!s) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const callbackUrl = `${window.location.origin}/auth/upgrade`;
    await signIn("google", { callbackUrl, redirect: true });
    return { ok: true };
  } catch {
    clearOauthLinkPending();
    return {
      ok: false,
      error:
        "Could not open Google sign-in after sign-out. Refresh the page — you may need to play as guest again, then tap Save progress with Google once more.",
    };
  }
}
