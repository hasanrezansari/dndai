"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";
import { useToast } from "@/components/ui/toast";

function dicebearInitialsUrl(seed: string): string {
  const safe = seed.trim().slice(0, 64) || "Adventurer";
  const encoded = encodeURIComponent(safe);
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encoded}&fontWeight=700`;
}

export default function ProfilePage() {
  const router = useRouter();
  const { status, data: session } = useSession();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);

  const avatarPreview = useMemo(() => {
    if (image?.trim()) return image.trim();
    return dicebearInitialsUrl(name || session?.user?.name || "Adventurer");
  }, [image, name, session?.user?.name]);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") {
      router.replace("/");
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/profile");
        const data: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          return;
        }
        const d = data as { name?: string; image?: string | null };
        if (!cancelled) {
          setName((d.name ?? session?.user?.name ?? "Adventurer").trim());
          setImage(typeof d.image === "string" ? d.image : null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, router, session?.user?.name]);

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          image: image?.trim() ? image.trim() : null,
        }),
      });
      if (!res.ok) {
        toast("Could not save profile", "error");
        return;
      }
      toast("Profile saved", "success");
    } catch {
      toast("Network error saving profile", "error");
    } finally {
      setSaving(false);
    }
  }

  function resetAvatarToAuto() {
    setImage(null);
  }

  return (
    <main className="min-h-dvh flex flex-col items-center px-6 pb-10 bg-[var(--color-obsidian)]">
      <div className="w-full max-w-md pt-10 flex flex-col gap-[var(--void-gap-lg)]">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--outline)]">
              Account
            </p>
            <h1 className="text-fantasy text-2xl font-bold text-[var(--color-silver-muted)]">
              Profile
            </h1>
          </div>
          <GhostButton size="sm" onClick={() => router.back()}>
            Back
          </GhostButton>
        </header>

        <GlassCard className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full overflow-hidden border border-[rgba(255,255,255,0.08)] bg-[var(--color-deep-void)] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarPreview}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--outline)]">
                Display name
              </p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={48}
                disabled={loading}
                className="mt-1 w-full min-h-[44px] rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-[var(--color-silver-muted)] text-base focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
              />
              <p className="mt-1 text-[10px] text-[var(--color-silver-dim)]">
                This name appears in party seats and the journal.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--outline)]">
              Avatar (optional URL)
            </p>
            <input
              value={image ?? ""}
              onChange={(e) => setImage(e.target.value || null)}
              placeholder="https://…"
              disabled={loading}
              className="mt-2 w-full min-h-[44px] rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-[var(--color-silver-muted)] text-sm focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
            />
            <div className="mt-3 flex gap-3">
              <GhostButton size="sm" onClick={resetAvatarToAuto} disabled={loading}>
                Use auto avatar
              </GhostButton>
              <GoldButton
                size="sm"
                className="ml-auto"
                disabled={loading || saving || !name.trim()}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save"}
              </GoldButton>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--outline)]">
            Preferences (stub)
          </p>
          <p className="mt-2 text-sm text-[var(--color-silver-dim)]">
            Preferences will live here next (sound, haptics, accessibility, content
            toggles). For now, this page establishes cross-device identity.
          </p>
        </GlassCard>
      </div>
    </main>
  );
}

