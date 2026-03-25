"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FeedEntry } from "@/lib/state/game-store";

import { FeedEntryRow } from "./feed-entry";

const PIN_THRESHOLD = 48;

export interface FeedListProps {
  entries: FeedEntry[];
  className?: string;
}

export function FeedList({ entries, className = "" }: FeedListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    const end = endRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    end?.scrollIntoView({ behavior: "smooth", block: "end" });
    setPinnedToBottom(true);
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinnedToBottom(gap <= PIN_THRESHOLD);
  }, []);

  useEffect(() => {
    if (!pinnedToBottom) return;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [entries, pinnedToBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!pinnedToBottom) return;
      el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pinnedToBottom]);

  return (
    <div className={`relative flex min-h-0 flex-1 flex-col ${className}`}>
      {!pinnedToBottom && entries.length > 0 && (
        <div
          className="mb-2 flex shrink-0 items-center gap-2 rounded-[var(--radius-chip)] border border-white/[0.06] border-l-[3px] border-l-[var(--color-gold-support)]/50 bg-[var(--color-deep-void)]/75 px-3 py-2 backdrop-blur-sm"
          role="status"
        >
          <span className="text-data text-xs text-[var(--color-gold-support)]" aria-hidden>
            ↑
          </span>
          <p className="text-data min-w-0 flex-1 text-[11px] leading-snug text-[var(--color-silver-dim)]">
            Pinned to bottom off — new activity below
          </p>
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden pb-16 sm:gap-4"
      >
        {entries.length === 0 ? (
          <p className="text-center text-sm text-[var(--color-silver-dim)]">
            No events yet.
          </p>
        ) : (
          entries.map((e) => <FeedEntryRow key={e.id} entry={e} />)
        )}
        <div ref={endRef} className="h-px w-full shrink-0" aria-hidden />
      </div>
      {!pinnedToBottom && entries.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center">
          <button
            type="button"
            onClick={() => scrollToBottom()}
            className="pointer-events-auto min-h-[44px] rounded-full border border-[var(--color-gold-support)]/45 bg-[var(--color-deep-void)]/95 px-5 py-2.5 text-data text-xs font-medium text-[var(--color-gold-support)] shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-transform active:scale-[0.98]"
          >
            ↓ New activity
          </button>
        </div>
      )}
    </div>
  );
}
