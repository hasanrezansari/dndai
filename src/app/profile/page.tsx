"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";
import { useToast } from "@/components/ui/toast";
import { HeroKitPreview } from "@/components/character/hero-kit-preview";
import { PillSelect } from "@/components/ui/pill-select";
import {
  ClassProfileSchema,
  type ClassProfile,
  type CharacterStats,
} from "@/lib/schemas/domain";

const ABILITY_BUDGET_CAP = 10;
const GEAR_BUDGET_CAP = 7;
const STAT_BIAS_CAP = 5;

const STAT_ORDER: { key: keyof CharacterStats; label: string }[] = [
  { key: "str", label: "STR" },
  { key: "dex", label: "DEX" },
  { key: "con", label: "CON" },
  { key: "int", label: "INT" },
  { key: "wis", label: "WIS" },
  { key: "cha", label: "CHA" },
];

type ProfileHero = {
  id: string;
  name: string;
  heroClass: string;
  race: string;
  isPublic: boolean;
  portraitUrl?: string;
  visualProfile?: Record<string, unknown>;
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
  const [heroFreeSlots, setHeroFreeSlots] = useState(1);
  const [heroBuilderOpen, setHeroBuilderOpen] = useState(false);
  const [inspectedHeroId, setInspectedHeroId] = useState<string | null>(null);
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
  const [heroBuilderPortraitBusy, setHeroBuilderPortraitBusy] = useState(false);
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
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [incomingRequests, setIncomingRequests] = useState<
    Array<{ id: string; fromUserId: string; fromName: string; fromImage: string | null }>
  >([]);
  const [outgoingRequests, setOutgoingRequests] = useState<
    Array<{ id: string; toUserId: string; toName: string; toImage: string | null }>
  >([]);

  const avatarPreview = useMemo(() => {
    if (image?.trim()) return image.trim();
    return dicebearInitialsUrl(name || session?.user?.name || "Adventurer");
  }, [image, name, session?.user?.name]);

  const inspectedHero = useMemo(() => {
    if (!inspectedHeroId) return null;
    return heroes.find((h) => h.id === inspectedHeroId) ?? null;
  }, [heroes, inspectedHeroId]);

  const inspectedHeroKit = useMemo(() => {
    const vp = inspectedHero?.visualProfile;
    if (!vp || typeof vp !== "object") return null;
    const raw = (vp as Record<string, unknown>).class_profile;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  }, [inspectedHero]);

  const inspectedHeroClassProfile = useMemo((): ClassProfile | null => {
    if (!inspectedHeroKit) return null;
    const parsed = ClassProfileSchema.safeParse(inspectedHeroKit);
    return parsed.success ? parsed.data : null;
  }, [inspectedHeroKit]);

  const builderClassProfile = useMemo((): ClassProfile | null => {
    if (!heroKit || typeof heroKit !== "object") return null;
    const parsed = ClassProfileSchema.safeParse(heroKit);
    return parsed.success ? parsed.data : null;
  }, [heroKit]);

  const customAbilityBudget = useMemo(
    () =>
      builderClassProfile?.abilities.reduce((sum, a) => sum + a.power_cost, 0) ?? 0,
    [builderClassProfile],
  );
  const customGearBudget = useMemo(
    () =>
      builderClassProfile?.starting_gear.reduce((sum, g) => sum + g.power_cost, 0) ??
      0,
    [builderClassProfile],
  );
  const customStatBiasBudget = useMemo(
    () =>
      builderClassProfile
        ? Object.values(builderClassProfile.stat_bias).reduce(
            (sum, n) => sum + Math.max(0, n),
            0,
          )
        : 0,
    [builderClassProfile],
  );

  const slotsFull = heroes.length >= heroFreeSlots;

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
          freeSlots?: number;
        };
        if (cancelled) return;
        setHeroes(Array.isArray(d.heroes) ? d.heroes : []);
        setPublicProfileEnabledState(Boolean(d.publicProfileEnabled));
        setHeroFreeSlots(
          typeof d.freeSlots === "number" && d.freeSlots > 0 ? d.freeSlots : 1,
        );
        setHeroBuilderOpen(false);
        setInspectedHeroId(null);
      } finally {
        setHeroesLoading(false);
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
      setRequestsLoading(true);
      try {
        const [friendsRes, playedRes, reqRes] = await Promise.all([
          fetch("/api/friends"),
          fetch("/api/friends/played-with?limit=20"),
          fetch("/api/friends/requests"),
        ]);
        const friendsJson: unknown = await friendsRes.json().catch(() => ({}));
        const playedJson: unknown = await playedRes.json().catch(() => ({}));
        const reqJson: unknown = await reqRes.json().catch(() => ({}));
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
        if (reqRes.ok) {
          const d = reqJson as {
            incoming?: Array<{
              id: string;
              fromUserId: string;
              fromName: string;
              fromImage: string | null;
            }>;
            outgoing?: Array<{
              id: string;
              toUserId: string;
              toName: string;
              toImage: string | null;
            }>;
          };
          setIncomingRequests(Array.isArray(d.incoming) ? d.incoming : []);
          setOutgoingRequests(Array.isArray(d.outgoing) ? d.outgoing : []);
        }
      } finally {
        if (!cancelled) {
          setFriendsLoading(false);
          setPlayedWithLoading(false);
          setRequestsLoading(false);
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
    const d = data as {
      heroes?: ProfileHero[];
      publicProfileEnabled?: boolean;
      freeSlots?: number;
    };
    setHeroes(Array.isArray(d.heroes) ? d.heroes : []);
    setPublicProfileEnabledState(Boolean(d.publicProfileEnabled));
    setHeroFreeSlots(
      typeof d.freeSlots === "number" && d.freeSlots > 0 ? d.freeSlots : 1,
    );
  }

  async function handleGenerateBuilderPortraitAI() {
    if (heroBuilderPortraitBusy) return;
    if (!heroName.trim()) {
      toast("Enter a hero name first", "error");
      return;
    }
    if (!heroConcept.trim() && !heroAppearance.trim()) {
      toast("Add a concept or appearance first", "error");
      return;
    }
    setHeroBuilderPortraitBusy(true);
    try {
      const res = await fetch("/api/characters/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: heroName.trim(),
          heroClass: heroClass.trim(),
          race: heroRace.trim(),
          concept: heroConcept.trim() || undefined,
          appearance: heroAppearance.trim() || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        portraitUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 402) {
          toast(j.error ?? "Portrait generation costs Sparks", "error");
        } else {
          toast(j.error ?? "Could not generate portrait", "error");
        }
        return;
      }
      if (!j.portraitUrl) {
        toast("Could not generate portrait", "error");
        return;
      }
      setHeroPortraitUrl(j.portraitUrl);
      toast("Portrait generated", "success");
    } catch {
      toast("Network error generating portrait", "error");
    } finally {
      setHeroBuilderPortraitBusy(false);
    }
  }

  async function handleCreateHero() {
    if (heroBusy) return;
    if (slotsFull) {
      toast("Hero slot is full. Unlock a new slot to create another hero.", "error");
      return;
    }
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
      const created = (await res.json().catch(() => ({}))) as {
        hero?: { id?: string };
      };
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
      setHeroBuilderOpen(false);
      if (created.hero?.id) {
        setInspectedHeroId(created.hero.id);
      }
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
      const parsed = ClassProfileSchema.safeParse(data.classProfile);
      if (!parsed.success) {
        toast("Generated kit was invalid. Try again.", "error");
        return;
      }
      setHeroKit(parsed.data);
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
          toast(j.error ?? "Portrait reroll costs Sparks", "error");
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
    const [friendsRes, playedRes, reqRes] = await Promise.all([
      fetch("/api/friends"),
      fetch("/api/friends/played-with?limit=20"),
      fetch("/api/friends/requests"),
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
    if (reqRes.ok) {
      const j = (await reqRes.json().catch(() => ({}))) as {
        incoming?: Array<{ id: string; fromUserId: string; fromName: string; fromImage: string | null }>;
        outgoing?: Array<{ id: string; toUserId: string; toName: string; toImage: string | null }>;
      };
      setIncomingRequests(Array.isArray(j.incoming) ? j.incoming : []);
      setOutgoingRequests(Array.isArray(j.outgoing) ? j.outgoing : []);
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
        toast(j.error ?? "Could not send request", "error");
        return;
      }
      toast("Friend request sent", "success");
      await refreshSocial();
    } catch {
      toast("Network error sending request", "error");
    }
  }

  async function handleRespondToRequest(requestId: string, action: "accept" | "decline") {
    try {
      const res = await fetch(`/api/friends/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        toast("Could not update request", "error");
        return;
      }
      toast(action === "accept" ? "Friend added" : "Request declined", "success");
      await refreshSocial();
    } catch {
      toast("Network error updating request", "error");
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
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {heroes.map((h) => (
                  <div
                    key={h.id}
                    className="relative overflow-hidden rounded-[var(--radius-card)] border border-white/10 bg-[var(--surface-container)]/25"
                  >
                    <div className="absolute inset-0 opacity-70">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={h.portraitUrl?.trim() || dicebearHeroPortrait(h.name)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-[var(--color-obsidian)]/70 to-transparent" />

                    <div className="relative p-4 flex flex-col gap-3 min-h-[10.5rem]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-fantasy text-lg text-[var(--color-silver-muted)] truncate">
                            {h.name}
                          </p>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                            {h.heroClass} · {h.race}
                          </p>
                        </div>
                        <div
                          className={`shrink-0 min-h-[28px] px-2 rounded-[var(--radius-chip)] border text-[9px] font-black uppercase tracking-[0.18em] ${
                            h.isPublic
                              ? "border-[rgba(212,175,55,0.35)] text-[var(--color-gold-rare)] bg-[var(--surface-high)]/35"
                              : "border-white/10 text-[var(--outline)] bg-black/20"
                          }`}
                          title={h.isPublic ? "Public" : "Private"}
                        >
                          {h.isPublic ? "Public" : "Private"}
                        </div>
                      </div>

                      <div className="mt-auto grid grid-cols-2 gap-2">
                        {!h.portraitUrl ? (
                          <GhostButton
                            size="sm"
                            disabled={heroBusy || heroAiPortraitBusy}
                            onClick={() => void handleGenerateHeroPortraitAI(h.id)}
                            className="col-span-2"
                          >
                            {heroAiPortraitBusy ? "Generating…" : "Generate portrait"}
                          </GhostButton>
                        ) : (
                          <GhostButton
                            size="sm"
                            disabled
                            onClick={() =>
                              toast("Portrait reroll costs Sparks (coming soon).", "info")
                            }
                            className="col-span-2"
                          >
                            Reroll (Sparks)
                          </GhostButton>
                        )}

                        <GhostButton
                          size="sm"
                          disabled={heroBusy}
                          onClick={() =>
                            setInspectedHeroId((prev) => (prev === h.id ? null : h.id))
                          }
                          className="col-span-2"
                        >
                          {inspectedHeroId === h.id ? "Hide build" : "View build"}
                        </GhostButton>

                        <GhostButton
                          size="sm"
                          disabled={heroBusy}
                          onClick={() => void handleToggleHeroPublic(h.id, !h.isPublic)}
                        >
                          {h.isPublic ? "Private" : "Public"}
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
                  </div>
                ))}

                {Array.from({ length: Math.max(0, heroFreeSlots - heroes.length) }).map(
                  (_, idx) => (
                    <button
                      key={`hero-slot-${idx}`}
                      type="button"
                      onClick={() => setHeroBuilderOpen(true)}
                      className="rounded-[var(--radius-card)] border border-dashed border-white/10 bg-black/10 p-4 flex flex-col items-center justify-center gap-2 min-h-[10.5rem] hover:border-[rgba(212,175,55,0.25)] hover:bg-[var(--surface-container)]/20 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[var(--outline)]">
                        add
                      </span>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)] text-center">
                        Create hero
                      </p>
                      <p className="text-xs text-[var(--color-silver-dim)] text-center max-w-[22ch]">
                        Fill this slot with a new build.
                      </p>
                    </button>
                  ),
                )}

                {slotsFull ? (
                  <div className="rounded-[var(--radius-card)] border border-white/10 bg-black/10 p-4 flex flex-col items-center justify-center gap-2 min-h-[10.5rem] relative overflow-hidden">
                    <div className="pointer-events-none absolute inset-0 opacity-70">
                      <div className="absolute -top-10 -left-16 h-40 w-40 rounded-full bg-[rgba(212,175,55,0.08)] blur-2xl" />
                      <div className="absolute -bottom-12 -right-16 h-44 w-44 rounded-full bg-[rgba(120,74,32,0.16)] blur-2xl" />
                    </div>
                    <span className="relative material-symbols-outlined text-[var(--outline)]">
                      lock
                    </span>
                    <p className="relative text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)] text-center">
                      + New slot (locked)
                    </p>
                    <p className="relative text-xs text-[var(--color-silver-dim)] text-center max-w-[24ch]">
                      Unlock with <span className="text-[var(--color-gold-rare)] font-bold">10 Sparks</span>{" "}
                      (coming soon).
                    </p>
                    <p className="relative text-[10px] uppercase tracking-[0.18em] text-[var(--outline)] text-center">
                      Or delete your hero to replace it.
                    </p>
                  </div>
                ) : null}
              </div>

              {inspectedHero && inspectedHeroId ? (
                <div className="rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--color-midnight)] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
                    Build: {inspectedHero.name}
                  </p>
                  {inspectedHeroClassProfile ? (
                    <div className="mt-3">
                      <HeroKitPreview profile={inspectedHeroClassProfile} />
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--color-silver-dim)]">
                      No kit saved for this hero yet. Use the builder below to generate one
                      and re-save.
                    </p>
                  )}
                </div>
              ) : null}

              <div className="rounded-[var(--radius-card)] border border-white/10 bg-black/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
                      Hero builder
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-silver-dim)]">
                      Generate a kit (class, abilities, gear) and an AI portrait, then save.
                      {slotsFull
                        ? " Your free slot is full — unlock another slot (10 Sparks) or delete your hero to replace."
                        : ""}
                    </p>
                  </div>
                  <GhostButton
                    size="sm"
                    disabled={heroBusy}
                    onClick={() => {
                      if (slotsFull) {
                        toast(
                          "Hero slot is full. Unlock a new slot (10 Sparks) or delete your hero to replace it.",
                          "error",
                        );
                        return;
                      }
                      setHeroBuilderOpen((v) => !v);
                    }}
                  >
                    {heroBuilderOpen ? "Hide" : heroes.length > 0 ? "Build new" : "Create"}
                  </GhostButton>
                </div>
              </div>

              {heroBuilderOpen && !slotsFull ? (
                <div className="space-y-3">
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

                {builderClassProfile ? (
                  <div className="col-span-2 rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--color-midnight)] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
                      Generated kit preview
                    </p>
                    <p className="mt-2 text-sm text-[var(--color-silver-dim)]">
                      This is what will be saved into your hero’s build.
                    </p>
                    <div className="mt-4 space-y-4">
                      <div className="space-y-3">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                          Ability Budget {customAbilityBudget}/{ABILITY_BUDGET_CAP}
                        </p>
                        <div className="h-2 w-full overflow-hidden rounded-full border border-white/10 bg-black/20">
                          <div
                            className="h-full bg-[var(--color-gold-rare)]/70"
                            style={{
                              width: `${Math.max(
                                2,
                                Math.min(
                                  100,
                                  Math.round(
                                    (customAbilityBudget / ABILITY_BUDGET_CAP) * 100,
                                  ),
                                ),
                              )}%`,
                            }}
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          {builderClassProfile.abilities.map((ability, idx) => (
                            <div
                              key={`${ability.name}-${idx}`}
                              className="grid grid-cols-2 gap-2"
                            >
                              <input
                                type="text"
                                value={ability.name}
                                onChange={(e) =>
                                  setHeroKit((prev: unknown) => {
                                    const parsed = ClassProfileSchema.safeParse(prev);
                                    if (!parsed.success) return prev;
                                    const next = [...parsed.data.abilities];
                                    next[idx] = {
                                      ...next[idx]!,
                                      name: e.target.value.slice(0, 40),
                                    };
                                    return { ...parsed.data, abilities: next };
                                  })
                                }
                                className="col-span-2 w-full min-h-[40px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                              />
                              <PillSelect
                                options={[
                                  { value: "active", label: "Active" },
                                  { value: "passive", label: "Passive" },
                                ]}
                                value={ability.type}
                                onChange={(value) =>
                                  setHeroKit((prev: unknown) => {
                                    const parsed = ClassProfileSchema.safeParse(prev);
                                    if (!parsed.success) return prev;
                                    const next = [...parsed.data.abilities];
                                    next[idx] = {
                                      ...next[idx]!,
                                      type: value as typeof ability.type,
                                    };
                                    return { ...parsed.data, abilities: next };
                                  })
                                }
                                size="sm"
                                wrap={false}
                                className="w-full overflow-x-auto scrollbar-hide pb-1"
                              />
                              <PillSelect
                                options={[
                                  { value: "damage", label: "Damage" },
                                  { value: "heal", label: "Heal" },
                                  { value: "shield", label: "Shield" },
                                  { value: "buff", label: "Buff" },
                                  { value: "debuff", label: "Debuff" },
                                  { value: "mobility", label: "Mobility" },
                                  { value: "utility", label: "Utility" },
                                ]}
                                value={ability.effect_kind}
                                onChange={(value) =>
                                  setHeroKit((prev: unknown) => {
                                    const parsed = ClassProfileSchema.safeParse(prev);
                                    if (!parsed.success) return prev;
                                    const next = [...parsed.data.abilities];
                                    next[idx] = {
                                      ...next[idx]!,
                                      effect_kind: value as typeof ability.effect_kind,
                                    };
                                    return { ...parsed.data, abilities: next };
                                  })
                                }
                                size="sm"
                                wrap={false}
                                className="w-full overflow-x-auto scrollbar-hide pb-1"
                              />
                              <label className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                                Resource
                                <input
                                  type="number"
                                  min={0}
                                  max={6}
                                  value={ability.resource_cost}
                                  onChange={(e) =>
                                    setHeroKit((prev: unknown) => {
                                      const parsed = ClassProfileSchema.safeParse(prev);
                                      if (!parsed.success) return prev;
                                      const next = [...parsed.data.abilities];
                                      next[idx] = {
                                        ...next[idx]!,
                                        resource_cost: Math.max(
                                          0,
                                          Math.min(6, Number(e.target.value) || 0),
                                        ),
                                      };
                                      return { ...parsed.data, abilities: next };
                                    })
                                  }
                                  className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                                Cooldown
                                <input
                                  type="number"
                                  min={0}
                                  max={6}
                                  value={ability.cooldown}
                                  onChange={(e) =>
                                    setHeroKit((prev: unknown) => {
                                      const parsed = ClassProfileSchema.safeParse(prev);
                                      if (!parsed.success) return prev;
                                      const next = [...parsed.data.abilities];
                                      next[idx] = {
                                        ...next[idx]!,
                                        cooldown: Math.max(
                                          0,
                                          Math.min(6, Number(e.target.value) || 0),
                                        ),
                                      };
                                      return { ...parsed.data, abilities: next };
                                    })
                                  }
                                  className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                                Power Cost
                                <input
                                  type="number"
                                  min={1}
                                  max={6}
                                  value={ability.power_cost}
                                  onChange={(e) =>
                                    setHeroKit((prev: unknown) => {
                                      const parsed = ClassProfileSchema.safeParse(prev);
                                      if (!parsed.success) return prev;
                                      const next = [...parsed.data.abilities];
                                      next[idx] = {
                                        ...next[idx]!,
                                        power_cost: Math.max(
                                          1,
                                          Math.min(6, Number(e.target.value) || 1),
                                        ),
                                      };
                                      return { ...parsed.data, abilities: next };
                                    })
                                  }
                                  className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                                />
                              </label>
                            </div>
                          ))}
                        </div>

                        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                          Gear Budget {customGearBudget}/{GEAR_BUDGET_CAP}
                        </p>
                        <div className="h-2 w-full overflow-hidden rounded-full border border-white/10 bg-black/20">
                          <div
                            className="h-full bg-[var(--color-gold-rare)]/70"
                            style={{
                              width: `${Math.max(
                                2,
                                Math.min(
                                  100,
                                  Math.round((customGearBudget / GEAR_BUDGET_CAP) * 100),
                                ),
                              )}%`,
                            }}
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          {builderClassProfile.starting_gear.map((gear, idx) => (
                            <div
                              key={`${gear.name}-${idx}`}
                              className="grid grid-cols-2 gap-2"
                            >
                              <input
                                type="text"
                                value={gear.name}
                                onChange={(e) =>
                                  setHeroKit((prev: unknown) => {
                                    const parsed = ClassProfileSchema.safeParse(prev);
                                    if (!parsed.success) return prev;
                                    const next = [...parsed.data.starting_gear];
                                    next[idx] = {
                                      ...next[idx]!,
                                      name: e.target.value.slice(0, 40),
                                    };
                                    return { ...parsed.data, starting_gear: next };
                                  })
                                }
                                className="col-span-2 w-full min-h-[40px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                              />
                              <PillSelect
                                options={[
                                  { value: "weapon", label: "Weapon" },
                                  { value: "armor", label: "Armor" },
                                  { value: "focus", label: "Focus" },
                                  { value: "tool", label: "Tool" },
                                  { value: "cyberware", label: "Cyberware" },
                                ]}
                                value={gear.type}
                                onChange={(value) =>
                                  setHeroKit((prev: unknown) => {
                                    const parsed = ClassProfileSchema.safeParse(prev);
                                    if (!parsed.success) return prev;
                                    const next = [...parsed.data.starting_gear];
                                    next[idx] = {
                                      ...next[idx]!,
                                      type: value as typeof gear.type,
                                    };
                                    return { ...parsed.data, starting_gear: next };
                                  })
                                }
                                size="sm"
                                wrap={false}
                                className="w-full overflow-x-auto scrollbar-hide pb-1"
                              />
                              <label className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                                Power Cost
                                <input
                                  type="number"
                                  min={1}
                                  max={4}
                                  value={gear.power_cost}
                                  onChange={(e) =>
                                    setHeroKit((prev: unknown) => {
                                      const parsed = ClassProfileSchema.safeParse(prev);
                                      if (!parsed.success) return prev;
                                      const next = [...parsed.data.starting_gear];
                                      next[idx] = {
                                        ...next[idx]!,
                                        power_cost: Math.max(
                                          1,
                                          Math.min(4, Number(e.target.value) || 1),
                                        ),
                                      };
                                      return { ...parsed.data, starting_gear: next };
                                    })
                                  }
                                  className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                                />
                              </label>
                            </div>
                          ))}
                        </div>

                        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                          Stat Bias Budget {customStatBiasBudget}/{STAT_BIAS_CAP}
                        </p>
                        <div className="h-2 w-full overflow-hidden rounded-full border border-white/10 bg-black/20">
                          <div
                            className="h-full bg-[var(--color-gold-rare)]/70"
                            style={{
                              width: `${Math.max(
                                2,
                                Math.min(
                                  100,
                                  Math.round(
                                    (customStatBiasBudget / STAT_BIAS_CAP) * 100,
                                  ),
                                ),
                              )}%`,
                            }}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {STAT_ORDER.map(({ key, label }) => (
                            <label
                              key={key}
                              className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]"
                            >
                              {label}
                              <input
                                type="number"
                                min={-2}
                                max={3}
                                value={builderClassProfile.stat_bias[key]}
                                onChange={(e) =>
                                  setHeroKit((prev: unknown) => {
                                    const parsed = ClassProfileSchema.safeParse(prev);
                                    if (!parsed.success) return prev;
                                    const nextBias = { ...parsed.data.stat_bias };
                                    nextBias[key] = Math.max(
                                      -2,
                                      Math.min(3, Number(e.target.value) || 0),
                                    );
                                    return { ...parsed.data, stat_bias: nextBias };
                                  })
                                }
                                className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                    Portrait (one image)
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-14 w-14 overflow-hidden rounded-[var(--radius-avatar)] border border-white/10 bg-black/20 shrink-0">
                      {heroPortraitUrl.trim() ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={heroPortraitUrl.trim()}
                          alt="Hero portrait preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-[var(--outline)] text-xs">
                          —
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-[var(--color-silver-dim)]">
                        Generate one portrait from your concept.
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                        Rerolls cost Sparks later.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-3">
                    <GhostButton
                      size="sm"
                      disabled={heroBusy || heroBuilderPortraitBusy}
                      onClick={() => void handleGenerateBuilderPortraitAI()}
                      className="w-full"
                    >
                      {heroBuilderPortraitBusy ? "Generating…" : "Generate AI portrait"}
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
              ) : null}
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
              Friend requests
            </p>
            {requestsLoading ? (
              <p className="mt-2 text-sm text-[var(--color-silver-dim)]">Loading…</p>
            ) : incomingRequests.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-silver-dim)]">
                No requests.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {incomingRequests.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-[var(--radius-card)] border border-white/10 bg-black/15 px-3 py-3"
                  >
                    <div className="h-10 w-10 overflow-hidden rounded-[var(--radius-avatar)] border border-white/10 bg-black/20 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.fromImage?.trim() || dicebearInitialsUrl(r.fromName)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[var(--color-silver-muted)]">
                        {r.fromName}
                      </p>
                      <p className="text-[10px] text-[var(--color-silver-dim)]">
                        wants to be friends
                      </p>
                    </div>
                    <GhostButton
                      size="sm"
                      onClick={() => void handleRespondToRequest(r.id, "decline")}
                    >
                      Decline
                    </GhostButton>
                    <GhostButton
                      size="sm"
                      onClick={() => void handleRespondToRequest(r.id, "accept")}
                    >
                      Accept
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
                  const alreadyRequested = outgoingRequests.some(
                    (r) => r.toUserId === u.userId,
                  );
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
                      ) : alreadyRequested ? (
                        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                          Requested
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

