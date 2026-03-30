"use client";

import { AnimatePresence, motion } from "framer-motion";

import { COPY } from "@/lib/copy/ashveil";

export interface SceneHeaderProps {
  sceneImage: string | null;
  previousSceneImage: string | null;
  sceneTitle: string | null;
  roundNumber: number;
  currentPlayerName: string | null;
  scenePending: boolean;
  /** Short atmosphere / phase label for chips (e.g. combat, exploration). */
  phaseLabel?: string | null;
  /** Raw session phase for chip accent (exploration, combat, …). */
  phase?: string | null;
  /** One-line teaser under the title (e.g. latest narration). */
  teaser?: string | null;
  /** Opens full scene + lore sheet (entire header is tappable). */
  onOpenDetails?: () => void;
  /** When false, hides round / phase / turn chips (e.g. room display). Default true. */
  showMetaChips?: boolean;
  /** When false, hides “Tap for scene & lore”. Default true. */
  showTapHint?: boolean;
  /**
   * When false and there is no teaser, omit the turn/waiting line under the title
   * (room display uses narration below instead).
   */
  showTurnWhenNoTeaser?: boolean;
}

function phaseChipClass(phase: string | undefined): string {
  switch (phase) {
    case "combat":
      return "border-[color-mix(in_srgb,var(--atmosphere-combat)_35%,transparent)] text-[var(--color-silver-muted)]";
    case "social":
      return "border-[color-mix(in_srgb,var(--atmosphere-social)_35%,transparent)] text-[var(--color-silver-muted)]";
    case "rest":
      return "border-[color-mix(in_srgb,var(--atmosphere-mystery)_30%,transparent)] text-[var(--color-silver-muted)]";
    case "exploration":
    default:
      return "border-[color-mix(in_srgb,var(--atmosphere-exploration)_35%,transparent)] text-[var(--color-silver-muted)]";
  }
}

export function SceneHeader({
  sceneImage,
  previousSceneImage,
  sceneTitle,
  roundNumber,
  currentPlayerName,
  scenePending,
  phaseLabel,
  phase,
  teaser,
  onOpenDetails,
  showMetaChips = true,
  showTapHint = true,
  showTurnWhenNoTeaser = true,
}: SceneHeaderProps) {
  const turnShort = currentPlayerName
    ? `${currentPlayerName}'s turn`
    : "Waiting…";

  const showBackdrop = !sceneImage && !previousSceneImage;

  const showBlockingPaintOverlay =
    scenePending && !sceneImage && !previousSceneImage;

  type Chip = { text: string; accentPhase: string | null };
  const chips: Chip[] = [];
  if (phaseLabel?.trim()) {
    chips.push({
      text: phaseLabel.trim(),
      accentPhase: phase?.trim() ?? phaseLabel.trim().toLowerCase(),
    });
  }
  chips.push({ text: `Round ${roundNumber}`, accentPhase: null });
  if (currentPlayerName && chips.length < 3) {
    const name =
      currentPlayerName.length > 14
        ? `${currentPlayerName.slice(0, 12)}…`
        : currentPlayerName;
    chips.push({ text: name, accentPhase: null });
  }
  const visibleChips = showMetaChips ? chips.slice(0, 3) : [];

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        {showBackdrop ? (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(165deg, var(--color-deep-void) 0%, var(--atmosphere-mystery) 45%, var(--color-midnight) 100%)",
            }}
          />
        ) : null}

        {previousSceneImage && sceneImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previousSceneImage}
            alt=""
            className="absolute inset-0 z-0 h-full w-full object-cover"
          />
        ) : null}

        <AnimatePresence initial={false}>
          {sceneImage ? (
            <motion.img
              key={sceneImage}
              src={sceneImage}
              alt=""
              loading="eager"
              decoding="async"
              className="absolute inset-0 z-[1] h-full w-full object-cover"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            />
          ) : null}
        </AnimatePresence>

        {!sceneImage && previousSceneImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previousSceneImage}
            alt=""
            loading="eager"
            decoding="async"
            className="absolute inset-0 z-0 h-full w-full object-cover"
          />
        ) : null}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-[var(--color-obsidian)]/55 to-transparent" />

      {showBlockingPaintOverlay ? (
        <div
          className="pointer-events-none absolute inset-0 z-[3] flex flex-col items-center justify-center overflow-hidden"
          aria-busy
        >
          <div className="animate-shimmer absolute inset-0 opacity-[0.97]" />
          <p className="text-fantasy relative z-[1] text-sm tracking-wide text-[var(--color-gold-support)] drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
            {COPY.scenePending}
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 z-[2] flex flex-col justify-end pb-4 pl-4 pr-4 pt-14">
        {visibleChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleChips.map((c, i) => (
              <span
                key={`${c.text}-${i}`}
                className={`rounded-[var(--radius-pill)] border bg-[var(--color-obsidian)]/75 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] backdrop-blur-sm ${
                  c.accentPhase
                    ? phaseChipClass(c.accentPhase)
                    : "border-[rgba(77,70,53,0.25)] text-[var(--outline)]"
                }`}
              >
                {c.text}
              </span>
            ))}
          </div>
        ) : null}
        <h1
          className="text-fantasy mt-2 line-clamp-1 text-lg font-black leading-tight tracking-tight text-[var(--color-silver-muted)] sm:text-xl"
          style={{
            textShadow:
              "0 2px 20px rgba(0,0,0,0.98), 0 1px 6px rgba(0,0,0,0.95)",
          }}
        >
          {sceneTitle ?? "The world awaits…"}
        </h1>
        {teaser?.trim() ? (
          <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-[var(--color-silver-dim)]">
            {teaser}
          </p>
        ) : showTurnWhenNoTeaser ? (
          <p className="mt-1 line-clamp-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-gold-rare)]">
            {turnShort}
          </p>
        ) : null}
        {showTapHint ? (
          <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--outline)]">
            Tap for scene &amp; lore
          </p>
        ) : null}
      </div>

      {onOpenDetails && !showBlockingPaintOverlay ? (
        <button
          type="button"
          onClick={onOpenDetails}
          className="absolute inset-0 z-[4] cursor-pointer border-0 bg-transparent p-0"
          aria-label="Open scene and lore"
        />
      ) : null}
    </div>
  );
}
