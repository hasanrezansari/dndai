"use client";

import { useMemo } from "react";

import { useNarrationTts } from "@/lib/audio/use-narration-tts";

export interface NarrationAudioControlProps {
  text: string | null;
}

export function NarrationAudioControl({ text }: NarrationAudioControlProps) {
  const { isSupported, isSpeaking, speak, stop } = useNarrationTts();
  const hasText = useMemo(() => Boolean(text?.trim()), [text]);

  return (
    <div className="rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.18)] bg-[var(--surface-container)]/30 px-3 py-2.5">
      <p className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
        Narration Voice
      </p>
      {!isSupported ? (
        <p className="text-xs text-[var(--outline)]">
          Voice playback is unavailable on this browser.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!hasText || !text) return;
              speak(text);
            }}
            disabled={!hasText || isSpeaking}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--radius-chip)] border border-[rgba(77,70,53,0.25)] bg-[var(--surface-high)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--color-gold-support)] transition-colors disabled:cursor-not-allowed disabled:opacity-55 hover:border-[var(--color-gold-rare)]/35 hover:text-[var(--color-gold-rare)]"
          >
            <span className="material-symbols-outlined text-sm">volume_up</span>
            Play
          </button>
          <button
            type="button"
            onClick={stop}
            disabled={!isSpeaking}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--radius-chip)] border border-[rgba(77,70,53,0.25)] bg-[var(--surface-high)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--outline)] transition-colors disabled:cursor-not-allowed disabled:opacity-55 hover:border-[var(--color-failure)]/35 hover:text-[var(--color-failure)]"
          >
            <span className="material-symbols-outlined text-sm">stop</span>
            Stop
          </button>
          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
            {isSpeaking ? "Speaking" : hasText ? "Tap to hear" : "No narration yet"}
          </span>
        </div>
      )}
    </div>
  );
}
