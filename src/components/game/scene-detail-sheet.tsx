"use client";

import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";

export interface SceneDetailPanelProps {
  sceneImage: string | null;
  previousSceneImage: string | null;
  sceneTitle: string | null;
  narrativeText: string | null;
  onSaveProgress?: () => void;
  onSaveAndExit?: () => void;
}

/**
 * Full-bleed scene + lore for the expandable scene header (M1 mobile shell).
 */
export function SceneDetailPanel({
  sceneImage,
  previousSceneImage,
  sceneTitle,
  narrativeText,
  onSaveProgress,
  onSaveAndExit,
}: SceneDetailPanelProps) {
  const src = sceneImage ?? previousSceneImage;

  return (
    <div className="flex max-h-[min(75vh,640px)] flex-col gap-4 overflow-y-auto pb-4">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--color-deep-void)]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-[var(--outline)] text-xs"
            style={{
              background:
                "linear-gradient(165deg, var(--color-deep-void) 0%, var(--atmosphere-mystery) 45%, var(--color-midnight) 100%)",
            }}
          >
            No scene art yet
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-transparent to-transparent" />
      </div>
      <div className="px-1">
        <h2 className="text-fantasy text-xl font-black leading-tight tracking-tight text-[var(--color-silver-muted)]">
          {sceneTitle ?? "The world awaits…"}
        </h2>
        {narrativeText?.trim() ? (
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-silver-dim)]">
            {narrativeText}
          </p>
        ) : (
          <p className="mt-3 text-sm italic text-[var(--outline)]">
            The tale unfolds at the table…
          </p>
        )}
      </div>

      {onSaveProgress || onSaveAndExit ? (
        <div className="px-1 pt-1 space-y-2">
          {onSaveProgress ? (
            <GhostButton
              type="button"
              className="w-full min-h-[44px] text-[10px] font-bold uppercase tracking-[0.15em]"
              onClick={onSaveProgress}
            >
              Save progress
            </GhostButton>
          ) : null}
          {onSaveAndExit ? (
            <GoldButton
              type="button"
              size="md"
              className="w-full min-h-[44px]"
              onClick={onSaveAndExit}
            >
              Save &amp; exit
            </GoldButton>
          ) : null}
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)] text-center">
            Your story is saved automatically.
          </p>
        </div>
      ) : null}
    </div>
  );
}
