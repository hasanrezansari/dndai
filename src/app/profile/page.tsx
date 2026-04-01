"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";
import { useToast } from "@/components/ui/toast";

type ProfileHero = {
  id: string;
  name: string;
  heroClass: string;
  race: string;
  isPublic: boolean;
  portraitUrl?: string;
};

function dicebearInitialsUrl(seed: string): string {
  const safe = seed.trim().slice(0, 64) || "Adventurer";
  const encoded = encodeURIComponent(safe);
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encoded}&fontWeight=700`;
}

function dicebearHeroPortrait(seed: string): string {
  const safe = seed.trim().slice(0, 64) || "Hero";
  const encoded = encodeURIComponent(safe);
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encoded}`;
}

export default function ProfilePage() {
  const router = useRouter();
  const { status, data: session } = useSession();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [heroesLoading, setHeroesLoading] = useState(true);
  const [heroes, setHeroes] = useState<ProfileHero[]>([]);
  const [publicProfileEnabled, setPublicProfileEnabledState] = useState(false);
  const [heroName, setHeroName] = useState("");
  const [heroClass, setHeroClass] = useState("warrior");
  const [heroRace, setHeroRace] = useState("human");
  const [heroIsPublic, setHeroIsPublic] = useState(false);
  const [heroBusy, setHeroBusy] = useState(false);
  const [heroConcept, setHeroConcept] = useState("");
  const [heroKit, setHeroKit] = useState<unknown | null>(null);
  const [heroKitBusy, setHeroKitBusy] = useState(false);
  const [heroPortraitUrl, setHeroPortraitUrl] = useState("");
  const [heroPronouns, setHeroPronouns] = useState("they/them");
  const [heroTraits, setHeroTraits] = useState("");
  const [heroBackstory, setHeroBackstory] = useState("");
  const [heroAppearance, setHeroAppearance] = useState("");
  const [heroAiPortraitBusy, setHeroAiPortraitBusy] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friends, setFriends] = useState<
    Array<{ userId: string; name: string; image: string | null }>
  >([]);
  const [playedWithLoading, setPlayedWithLoading] = useState(true);
  const [playedWith, setPlayedWith] = useState<
    Array<{
      userId: string;
      name: string;
      image: string | null;
      sharedSessions: number;
      lastActivityAt: string;
    }>
  >([]);

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

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") return;
    let cancelled = false;
    async function loadHeroes() {
      setHeroesLoading(true);
      try {
        const res = await fetch("/api/profile/heroes");
        const data: unknown = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const d = data as {
          heroes?: ProfileHero[];
          publicProfileEnabled?: boolean;
        };
        if (cancelled) return;
        setHeroes(Array.isArray(d.heroes) ? d.heroes : []);
        setPublicProfileEnabledState(Boolean(d.publicProfileEnabled));
      } finally {
        if (!cancelled) setHeroesLoading(false);
      }
    }
    void loadHeroes();
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") return;
    let cancelled = false;
    async function loadSocial() {
      setFriendsLoading(true);
      setPlayedWithLoading(true);
      try {
        const [friendsRes, playedRes] = await Promise.all([
          fetch("/api/friends"),
          fetch("/api/friends/played-with?limit=20"),
        ]);
        const friendsJson: unknown = await friendsRes.json().catch(() => ({}));
        const playedJson: unknown = await playedRes.json().catch(() => ({}));
        if (cancelled) return;
        if (friendsRes.ok) {
          const d = friendsJson as {
            friends?: Array<{ userId: string; name: string; image: string | null }>;
          };
          setFriends(Array.isArray(d.friends) ? d.friends : []);
        }
        if (playedRes.ok) {
          const d = playedJson as {
            users?: Array<{
              userId: string;
              name: string;
              image: string | null;
              sharedSessions: number;
              lastActivityAt: string;
            }>;
          };
          setPlayedWith(Array.isArray(d.users) ? d.users : []);
        }
      } finally {
        if (!cancelled) {
          setFriendsLoading(false);
          setPlayedWithLoading(false);
        }
      }
    }
    void loadSocial();
    return () => {
      cancelled = true;
    };
  }, [status]);

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

  async function refreshHeroes() {
    const res = await fetch("/api/profile/heroes");
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const d = data as { heroes?: ProfileHero[]; publicProfileEnabled?: boolean };
    setHeroes(Array.isArray(d.heroes) ? d.heroes : []);
    setPublicProfileEnabledState(Boolean(d.publicProfileEnabled));
  }

  async function handleCreateHero() {
    if (heroBusy) return;
    if (!heroName.trim()) {
      toast("Enter a hero name", "error");
      return;
    }
    setHeroBusy(true);
    try {
      const res = await fetch("/api/profile/heroes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: heroName.trim(),
          heroClass: heroClass.trim(),
          race: heroRace.trim(),
          isPublic: heroIsPublic,
          visualProfile:
            heroKit && typeof heroKit === "object"
              ? {
                  concept: heroConcept.trim() || null,
                  class_profile: heroKit,
                  portrait_url: heroPortraitUrl.trim() || null,
                  pronouns: heroPronouns.trim() || "they/them",
                  traits: heroTraits
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .slice(0, 5),
                  backstory: heroBackstory.trim() || null,
                  appearance: heroAppearance.trim() || null,
                }
              : {
                  concept: heroConcept.trim() || null,
                  portrait_url: heroPortraitUrl.trim() || null,
                  pronouns: heroPronouns.trim() || "they/them",
                  traits: heroTraits
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .slice(0, 5),
                  backstory: heroBackstory.trim() || null,
                  appearance: heroAppearance.trim() || null,
                },
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast(j.error ?? "Could not create hero", "error");
        return;
      }
      toast("Saved hero created", "success");
      setHeroName("");
      setHeroIsPublic(false);
      setHeroConcept("");
      setHeroKit(null);
      setHeroPortraitUrl("");
      setHeroPronouns("they/them");
      setHeroTraits("");
      setHeroBackstory("");
      setHeroAppearance("");
      await refreshHeroes();
    } catch {
      toast("Network error creating hero", "error");
    } finally {
      setHeroBusy(false);
    }
  }

  async function handleGenerateHeroKit() {
    if (heroKitBusy) return;
    if (!heroConcept.trim()) {
      toast("Describe your hero concept first", "error");
      return;
    }
    setHeroKitBusy(true);
    try {
      const res = await fetch("/api/characters/generate-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept: heroConcept.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast(j.error ?? "Could not generate kit", "error");
        return;
      }
      const data = (await res.json()) as { classProfile?: unknown };
      if (!data.classProfile) {
        toast("Could not generate kit", "error");
        return;
      }
      setHeroKit(data.classProfile);
      toast("Kit generated", "success");
    } catch {
      toast("Network error generating kit", "error");
    } finally {
      setHeroKitBusy(false);
    }
  }

  async function handleGenerateHeroPortraitAI(heroId: string) {
    if (heroAiPortraitBusy) return;
    setHeroAiPortraitBusy(true);
    try {
      const res = await fetch(`/api/profile/heroes/${heroId}/portrait`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = (await res.json().catch(() => ({}))) as {
        portraitUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 402) {
          toast(j.error ?? "Portrait reroll requires payment", "error");
        } else {
          toast(j.error ?? "Could not generate portrait", "error");
        }
        return;
      }
      if (!j.portraitUrl) {
        toast("Could not generate portrait", "error");
        return;
      }
      toast("Portrait generated", "success");
      await refreshHeroes();
    } catch {
      toast("Network error generating portrait", "error");
    } finally {
      setHeroAiPortraitBusy(false);
    }
  }

  async function refreshSocial() {
    const [friendsRes, playedRes] = await Promise.all([
      fetch("/api/friends"),
      fetch("/api/friends/played-with?limit=20"),
    ]);
    if (friendsRes.ok) {
      const j = (await friendsRes.json().catch(() => ({}))) as {
        friends?: Array<{ userId: string; name: string; image: string | null }>;
      };
      setFriends(Array.isArray(j.friends) ? j.friends : []);
    }
    if (playedRes.ok) {
      const j = (await playedRes.json().catch(() => ({}))) as {
        users?: Array<{
          userId: string;
          name: string;
          image: string | null;
          sharedSessions: number;
          lastActivityAt: string;
        }>;
      };
      setPlayedWith(Array.isArray(j.users) ? j.users : []);
    }
  }

  async function handleAddFriend(friendUserId: string) {
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendUserId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast(j.error ?? "Could not add friend", "error");
        return;
      }
      toast("Friend added", "success");
      await refreshSocial();
    } catch {
      toast("Network error adding friend", "error");
    }
  }

  async function handleRemoveFriend(friendUserId: string) {
    try {
      const res = await fetch(`/api/friends/${friendUserId}`, { method: "DELETE" });
      if (!res.ok) {
        toast("Could not remove friend", "error");
        return;
      }
      toast("Friend removed", "success");
      await refreshSocial();
    } catch {
      toast("Network error removing friend", "error");
    }
  }

  async function handleDeleteHero(id: string) {
    if (heroBusy) return;
    setHeroBusy(true);
    try {
      const res = await fetch(`/api/profile/heroes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast("Could not delete hero", "error");
        return;
      }
      toast("Hero deleted", "success");
      await refreshHeroes();
    } finally {
      setHeroBusy(false);
    }
  }

  async function handleToggleHeroPublic(id: string, isPublic: boolean) {
    if (heroBusy) return;
    setHeroBusy(true);
    try {
      const res = await fetch(`/api/profile/heroes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic }),
      });
      if (!res.ok) {
        toast("Could not update hero visibility", "error");
        return;
      }
      await refreshHeroes();
    } finally {
      setHeroBusy(false);
    }
  }

  async function handleTogglePublicProfile(enabled: boolean) {
    setPublicProfileEnabledState(enabled);
    try {
      const res = await fetch("/api/profile/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicProfileEnabled: enabled }),
      });
      if (!res.ok) {
        toast("Could not update public profile", "error");
        await refreshHeroes();
        return;
      }
      toast(enabled ? "Public profile enabled" : "Public profile disabled", "success");
      await refreshHeroes();
    } catch {
      toast("Network error updating public profile", "error");
      await refreshHeroes();
    }
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

        <GlassCard className="p-6">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--outline)]">
            Saved heroes
          </p>
          <p className="mt-2 text-sm text-[var(--color-silver-dim)]">
            Save one hero to reuse across adventures. You can delete and replace it
            anytime.
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              Public profile
            </p>
            <button
              type="button"
              disabled={heroesLoading || heroBusy}
              onClick={() => void handleTogglePublicProfile(!publicProfileEnabled)}
              className={`min-h-[36px] px-3 rounded-[var(--radius-chip)] border text-[10px] font-bold uppercase tracking-[0.15em] transition-colors ${
                publicProfileEnabled
                  ? "border-[rgba(212,175,55,0.35)] text-[var(--color-gold-rare)] bg-[var(--surface-high)]/40"
                  : "border-white/10 text-[var(--outline)] bg-[var(--surface-container)]/20"
              }`}
            >
              {publicProfileEnabled ? "On" : "Off"}
            </button>
          </div>

          {heroesLoading ? (
            <p className="mt-4 text-sm text-[var(--color-silver-dim)]">Loading…</p>
          ) : heroes.length > 0 ? (
            <div className="mt-4 space-y-3">
              {heroes.map((h) => (
                <div
                  key={h.id}
                  className="rounded-[var(--radius-card)] border border-white/10 bg-[var(--surface-container)]/25 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-[var(--radius-avatar)] border border-white/10 bg-black/20 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={h.portraitUrl?.trim() || dicebearHeroPortrait(h.name)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-fantasy text-lg text-[var(--color-silver-muted)]">
                        {h.name}
                      </p>
                      <p className="text-xs text-[var(--color-silver-dim)] capitalize">
                        {h.heroClass} · {h.race}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {!h.portraitUrl ? (
                      <GhostButton
                        size="sm"
                        disabled={heroBusy || heroAiPortraitBusy}
                        onClick={() => void handleGenerateHeroPortraitAI(h.id)}
                      >
                        {heroAiPortraitBusy ? "Generating…" : "Generate portrait"}
                      </GhostButton>
                    ) : null}
                    <GhostButton
                      size="sm"
                      disabled={heroBusy}
                      onClick={() => void handleToggleHeroPublic(h.id, !h.isPublic)}
                    >
                      {h.isPublic ? "Make private" : "Make public"}
                    </GhostButton>
                    <GhostButton
                      size="sm"
                      disabled={heroBusy}
                      onClick={() => void handleDeleteHero(h.id)}
                      className="text-[var(--color-failure)]"
                    >
                      Delete
                    </GhostButton>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                    Hero name
                  </p>
                  <input
                    value={heroName}
                    onChange={(e) => setHeroName(e.target.value)}
                    maxLength={48}
                    className="mt-2 w-full min-h-[44px] rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-[var(--color-silver-muted)] text-base focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
                    placeholder="e.g. Aldric"
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                    Concept (optional, makes it alive)
                  </p>
                  <input
                    value={heroConcept}
                    onChange={(e) => setHeroConcept(e.target.value)}
                    className="mt-2 w-full min-h-[44px] rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-[var(--color-silver-muted)] text-sm focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
                    placeholder="e.g. Time Lord Spider"
                  />
                  <div className="mt-3 flex gap-3">
                    <GhostButton
                      size="sm"
                      disabled={heroKitBusy || heroBusy || !heroConcept.trim()}
                      onClick={() => void handleGenerateHeroKit()}
                      className="w-full"
                    >
                      {heroKitBusy ? "Generating…" : heroKit ? "Re-generate kit" : "Generate kit"}
                    </GhostButton>
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                    Portrait (one image)
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-14 w-14 overflow-hidden rounded-[var(--radius-avatar)] border border-white/10 bg-black/20 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          heroPortraitUrl.trim() ||
                          dicebearHeroPortrait(`${heroName} ${heroConcept}`)
                        }
                        alt="Hero portrait preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <input
                      value={heroPortraitUrl}
                      onChange={(e) => setHeroPortraitUrl(e.target.value)}
                      placeholder="(optional) https://…"
                      className="w-full min-h-[44px] rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-[var(--color-silver-muted)] text-sm focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
                    />
                  </div>
                  <div className="mt-3 flex gap-3">
                    <GhostButton
                      size="sm"
                      disabled={heroBusy}
                      onClick={() =>
                        setHeroPortraitUrl(
                          dicebearHeroPortrait(`${heroName} ${heroConcept}`),
                        )
                      }
                      className="w-full"
                    >
                      Auto portrait
                    </GhostButton>
                    <GhostButton
                      size="sm"
                      disabled={heroBusy}
                      onClick={() => setHeroPortraitUrl("")}
                      className="w-full"
                    >
                      Clear
                    </GhostButton>
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                    Pronouns
                  </p>
                  <input
                    value={heroPronouns}
                    onChange={(e) => setHeroPronouns(e.target.value)}
                    className="mt-2 w-full min-h-[44px] rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-[var(--color-silver-muted)] text-sm focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
                    placeholder="they/them"
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                    Traits (comma separated)
                  </p>
                  <input
                    value={heroTraits}
                    onChange={(e) => setHeroTraits(e.target.value)}
                    className="mt-2 w-full min-h-[44px] rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-[var(--color-silver-muted)] text-sm focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
                    placeholder="stoic, curious, ruthless"
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                    Backstory (optional)
                  </p>
                  <textarea
                    value={heroBackstory}
                    onChange={(e) => setHeroBackstory(e.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 py-3 text-[var(--color-silver-muted)] text-sm focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
                    placeholder="A short origin story…"
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                    Appearance (optional)
                  </p>
                  <textarea
                    value={heroAppearance}
                    onChange={(e) => setHeroAppearance(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 py-3 text-[var(--color-silver-muted)] text-sm focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
                    placeholder="How they look, vibe, outfit…"
                  />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                    Class
                  </p>
                  <input
                    value={heroClass}
                    onChange={(e) => setHeroClass(e.target.value)}
                    className="mt-2 w-full min-h-[44px] rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-[var(--color-silver-muted)] text-sm focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
                  />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                    Race
                  </p>
                  <input
                    value={heroRace}
                    onChange={(e) => setHeroRace(e.target.value)}
                    className="mt-2 w-full min-h-[44px] rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-[var(--color-silver-muted)] text-sm focus:outline-none focus:border-[rgba(212,175,55,0.25)]"
                  />
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 text-xs text-[var(--color-silver-dim)]">
                <span>Make this hero public</span>
                <input
                  type="checkbox"
                  checked={heroIsPublic}
                  onChange={(e) => setHeroIsPublic(e.target.checked)}
                />
              </label>
              <GoldButton
                size="sm"
                disabled={heroBusy || !heroName.trim()}
                onClick={() => void handleCreateHero()}
                className="w-full"
              >
                {heroBusy ? "Saving…" : "Save hero"}
              </GoldButton>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-6">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--outline)]">
            Social
          </p>
          <p className="mt-2 text-sm text-[var(--color-silver-dim)]">
            Add friends from people you’ve played with.
          </p>

          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              Friends
            </p>
            {friendsLoading ? (
              <p className="mt-2 text-sm text-[var(--color-silver-dim)]">Loading…</p>
            ) : friends.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-silver-dim)]">
                No friends yet.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {friends.map((f) => (
                  <div
                    key={f.userId}
                    className="flex items-center gap-3 rounded-[var(--radius-card)] border border-white/10 bg-black/15 px-3 py-3"
                  >
                    <div className="h-10 w-10 overflow-hidden rounded-[var(--radius-avatar)] border border-white/10 bg-black/20 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.image?.trim() || dicebearInitialsUrl(f.name)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[var(--color-silver-muted)]">
                        {f.name}
                      </p>
                    </div>
                    <GhostButton
                      size="sm"
                      onClick={() => void handleRemoveFriend(f.userId)}
                    >
                      Remove
                    </GhostButton>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              People you played with
            </p>
            {playedWithLoading ? (
              <p className="mt-2 text-sm text-[var(--color-silver-dim)]">Loading…</p>
            ) : playedWith.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-silver-dim)]">
                No co-players yet.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {playedWith.map((u) => {
                  const alreadyFriend = friends.some((f) => f.userId === u.userId);
                  return (
                    <div
                      key={u.userId}
                      className="flex items-center gap-3 rounded-[var(--radius-card)] border border-white/10 bg-black/15 px-3 py-3"
                    >
                      <div className="h-10 w-10 overflow-hidden rounded-[var(--radius-avatar)] border border-white/10 bg-black/20 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={u.image?.trim() || dicebearInitialsUrl(u.name)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[var(--color-silver-muted)]">
                          {u.name}
                        </p>
                        <p className="text-[10px] text-[var(--color-silver-dim)]">
                          {u.sharedSessions} session{u.sharedSessions === 1 ? "" : "s"} together
                        </p>
                      </div>
                      {alreadyFriend ? (
                        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                          Added
                        </span>
                      ) : (
                        <GhostButton
                          size="sm"
                          onClick={() => void handleAddFriend(u.userId)}
                        >
                          Add
                        </GhostButton>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </main>
  );
}

