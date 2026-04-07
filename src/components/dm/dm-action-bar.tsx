"use client";

import { useCallback, useState } from "react";

import { DcSetter } from "@/components/dm/dc-setter";
import { GoldButton } from "@/components/ui/gold-button";
import { useGameStore } from "@/lib/state/game-store";

export interface DmActionBarProps {
  onNarrate: (text: string) => void | Promise<void>;
  onSetDC: (dc: number) => void | Promise<void>;
  onAdvanceTurn: () => void | Promise<void>;
  onTriggerEvent: (event: string) => void | Promise<void>;
  waitingForDm: boolean;
  sessionId: string;
  playerId: string;
}

export function DmActionBar({
  onNarrate,
  onSetDC,
  onAdvanceTurn,
  onTriggerEvent,
  waitingForDm,
  sessionId,
  playerId,
}: DmActionBarProps) {
  const dmDc = useGameStore((s) => s.dmDc);
  const dmAwaiting = useGameStore((s) => s.dmAwaiting);
  const [narration, setNarration] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDc, setShowDc] = useState(false);
  const [showEvent, setShowEvent] = useState(false);
  const [eventText, setEventText] = useState("");

  const safeBottom =
    "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]";

  const toolBtn =
    "min-h-[44px] rounded-[var(--radius-chip)] border border-[var(--color-gold-rare)]/30 bg-[var(--color-midnight)]/90 px-3 text-sm font-medium text-[var(--color-gold-support)] transition-colors hover:border-[var(--color-gold-rare)]/50 hover:bg-[var(--color-gold-rare)]/10 active:scale-[0.98]";

  const submitNarration = useCallback(async () => {
    const t = narration.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onNarrate(t);
      setNarration("");
    } finally {
      setBusy(false);
    }
  }, [narration, onNarrate, busy]);

  const rollNpc = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/dm/roll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          diceType: "d20",
          context: "DM Roll",
          modifier: 0,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        window.alert(body.error ?? "Roll failed");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, playerId, sessionId]);

  const submitEvent = useCallback(async () => {
    const t = eventText.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onTriggerEvent(t);
      setEventText("");
      setShowEvent(false);
    } finally {
      setBusy(false);
    }
  }, [eventText, onTriggerEvent, busy]);

  return (
    <div
      className={`glass-heavy glow-gold space-y-3 px-3 py-3 ${safeBottom}`}
    >
      {waitingForDm ? (
        <div className="space-y-2 rounded-[var(--radius-chip)] border border-[var(--color-gold-rare)]/40 bg-[var(--color-gold-rare)]/10 px-3 py-2 text-[var(--color-gold-support)]">
          <div className="animate-pulse text-center text-sm font-medium">
            Player acted — narrate the outcome
          </div>
          {dmAwaiting?.betrayalBriefing ? (
            <div className="rounded-[var(--radius-chip)] border border-[var(--color-gold-rare)]/30 bg-[var(--color-midnight)]/35 p-2 text-xs">
              <p className="font-semibold">Betrayal beat brief</p>
              <p className="mt-1 opacity-90">{dmAwaiting.betrayalBriefing.spine}</p>
              {dmAwaiting.betrayalBriefing.prompts.length > 0 ? (
                <p className="mt-1 opacity-90">
                  Prompt beats: {dmAwaiting.betrayalBriefing.prompts.join(" | ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {dmDc != null ? (
        <p className="text-center text-xs text-[var(--color-gold-support)]">
          Active DC: {dmDc}
        </p>
      ) : null}

      <label className="sr-only" htmlFor="dm-narration">
        Narration
      </label>
      <textarea
        id="dm-narration"
        value={narration}
        onChange={(e) => setNarration(e.target.value)}
        rows={3}
        placeholder="Describe what happens next…"
        className="min-h-[88px] w-full resize-y rounded-[var(--radius-button)] border border-white/10 bg-[var(--color-deep-void)]/80 px-4 py-3 text-base leading-relaxed text-[var(--color-silver-muted)] placeholder:text-[var(--color-silver-dim)] focus:border-[var(--color-gold-rare)]/70 focus:outline-none focus:ring-2 focus:ring-[var(--color-gold-rare)]/40"
      />

      {showDc ? (
        <DcSetter onSet={(dc) => void onSetDC(dc)} onClose={() => setShowDc(false)} />
      ) : null}

      {showEvent ? (
        <div className="glass-heavy space-y-2 rounded-[var(--radius-button)] border border-white/10 p-3">
          <textarea
            value={eventText}
            onChange={(e) => setEventText(e.target.value)}
            rows={2}
            placeholder="Custom event for the table…"
            className="min-h-[72px] w-full rounded-[var(--radius-chip)] border border-white/10 bg-[var(--color-deep-void)]/80 px-3 py-2 text-sm text-[var(--color-silver-muted)] focus:border-[var(--color-gold-rare)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-gold-rare)]/30"
          />
          <div className="flex gap-2">
            <GoldButton
              type="button"
              size="sm"
              className="min-h-[44px] flex-1"
              disabled={!eventText.trim() || busy}
              onClick={() => void submitEvent()}
            >
              Send event
            </GoldButton>
            <button
              type="button"
              onClick={() => setShowEvent(false)}
              className="min-h-[44px] rounded-[var(--radius-button)] border border-white/12 px-3 text-sm text-[var(--color-silver-dim)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-[var(--void-gap)]">
        <button
          type="button"
          className={toolBtn}
          onClick={() => {
            setShowDc((v) => !v);
            setShowEvent(false);
          }}
        >
          Set DC
        </button>
        <button
          type="button"
          className={toolBtn}
          onClick={() => void rollNpc()}
        >
          Roll for NPC
        </button>
        <button
          type="button"
          className={toolBtn}
          onClick={() => void onAdvanceTurn()}
        >
          Advance Turn
        </button>
        <button
          type="button"
          className={toolBtn}
          onClick={() => {
            setShowEvent((v) => !v);
            setShowDc(false);
          }}
        >
          Trigger Event
        </button>
      </div>

      <GoldButton
        type="button"
        size="lg"
        className="min-h-[48px] w-full font-bold shadow-[0_0_32px_rgba(212,175,55,0.32)] ring-1 ring-[var(--color-gold-rare)]/30"
        onClick={() => void submitNarration()}
        disabled={!narration.trim() || busy}
      >
        {busy ? "…" : "Narrate"}
      </GoldButton>
    </div>
  );
}
