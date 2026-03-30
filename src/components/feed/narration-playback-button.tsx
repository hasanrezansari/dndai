"use client";

import {
  stopNarrationSpeech,
  toggleNarrationPlayback,
  useNarrationPlayback,
} from "@/lib/audio/use-narration-tts";

export interface NarrationPlaybackButtonProps {
  text: string;
  /** Icon-only, smaller — for meta rows (e.g. round recap) so story flow stays light. */
  compact?: boolean;
}

export function NarrationPlaybackButton({
  text,
  compact = false,
}: NarrationPlaybackButtonProps) {
  const playback = useNarrationPlayback();
  const trimmed = text.trim();
  const isActive = playback.activeText === trimmed && playback.isSpeaking;

  let label = "Hear narration";
  let icon = "volume_up";
  if (isActive && playback.isPaused) {
    label = "Resume narration";
    icon = "play_arrow";
  } else if (isActive) {
    label = "Pause narration";
    icon = "pause";
  }

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            if (!trimmed) return;
            toggleNarrationPlayback(trimmed);
          }}
          aria-label={label}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-[rgba(77,70,53,0.2)] bg-[var(--surface-high)]/60 text-[var(--color-gold-support)] transition-colors hover:border-[var(--color-gold-rare)]/35 hover:text-[var(--color-gold-rare)]"
        >
          <span className="material-symbols-outlined text-base">{icon}</span>
        </button>
        {isActive ? (
          <button
            type="button"
            onClick={() => {
              stopNarrationSpeech();
            }}
            aria-label="Stop narration"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-[rgba(77,70,53,0.2)] bg-[var(--surface-high)]/60 text-[var(--outline)] transition-colors hover:border-[var(--color-failure)]/35 hover:text-[var(--color-failure)]"
          >
            <span className="material-symbols-outlined text-base">stop</span>
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (!trimmed) return;
          toggleNarrationPlayback(trimmed);
        }}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[var(--radius-chip)] border border-[rgba(77,70,53,0.25)] bg-[var(--surface-high)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--color-gold-support)] transition-colors hover:border-[var(--color-gold-rare)]/35 hover:text-[var(--color-gold-rare)]"
      >
        <span className="material-symbols-outlined text-sm">{icon}</span>
        {label}
      </button>
      {isActive ? (
        <button
          type="button"
          onClick={() => {
            stopNarrationSpeech();
          }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[var(--radius-chip)] border border-[rgba(77,70,53,0.25)] bg-[var(--surface-high)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--outline)] transition-colors hover:border-[var(--color-failure)]/35 hover:text-[var(--color-failure)]"
        >
          <span className="material-symbols-outlined text-sm">stop</span>
          Stop
        </button>
      ) : null}
    </div>
  );
}
