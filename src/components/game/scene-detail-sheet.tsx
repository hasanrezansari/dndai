"use client";

export interface SceneDetailPanelProps {
  sceneImage: string | null;
  previousSceneImage: string | null;
  sceneTitle: string | null;
}

/**
 * Full-bleed scene + lore for the expandable scene header (M1 mobile shell).
 */
export function SceneDetailPanel({
  sceneImage,
  previousSceneImage,
  sceneTitle,
}: SceneDetailPanelProps) {
  const src = sceneImage ?? previousSceneImage;

  return (
    <div className="flex max-h-[min(75vh,640px)] flex-col gap-4 overflow-y-auto pb-4">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--color-deep-void)]">
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
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-silver-dim)]">
          Scene story is shown in the top header. Use Chronicle below for
          turn-by-turn narration, dice, and world shifts.
        </p>
      </div>
    </div>
  );
}
