"use client";

import { useMemo, useState } from "react";

import type { FeedEntry } from "@/lib/state/game-store";
import { useGameStore } from "@/lib/state/game-store";
import { GhostButton } from "@/components/ui/ghost-button";

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function typeLabel(type: FeedEntry["type"]) {
  switch (type) {
    case "action":
      return "Act";
    case "dice":
      return "Dice";
    case "narration":
      return "Nar";
    case "state_change":
      return "State";
    default:
      return "Sys";
  }
}

function assignRounds(entries: FeedEntry[]): Map<number, FeedEntry[]> {
  const sorted = [...entries].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  let r = 1;
  const map = new Map<number, FeedEntry[]>();
  for (const e of sorted) {
    if (e.type === "system") {
      const m = e.text.match(/^Round (\d+)/);
      if (m) r = Number.parseInt(m[1]!, 10);
    }
    const list = map.get(r) ?? [];
    list.push(e);
    map.set(r, list);
  }
  return map;
}

function QuestPins() {
  const quest = useGameStore((s) => s.quest);
  if (!quest) return null;

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--atmosphere-combat)]/20 bg-[var(--glass-bg)]/30 p-3">
      <h3 className="text-fantasy mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-gold-support)]">
        Active Quest
      </h3>
      <p className="text-sm leading-snug text-[var(--color-silver-muted)]">
        {quest.objective}
      </p>
      {quest.subObjectives && quest.subObjectives.length > 0 && (
        <ul className="mt-2 space-y-1">
          {quest.subObjectives.map((sub, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs text-[var(--color-silver-dim)]"
            >
              <span className="mt-0.5 text-[var(--color-gold-support)]">!</span>
              <span>{sub}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-4 text-[10px] tabular-nums text-[var(--color-silver-dim)]">
        <span>Progress {quest.progress}%</span>
        <span>Danger {quest.risk}%</span>
        <span className="capitalize">{quest.status.replace(/_/g, " ")}</span>
      </div>
    </section>
  );
}

function MemorySummaries() {
  const memories = useGameStore((s) => s.rollingMemories);
  if (!memories || memories.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-fantasy text-xs font-semibold uppercase tracking-widest text-[var(--color-silver-dim)]">
        Memory Archive
      </h3>
      {memories.map((mem) => (
        <div
          key={mem.id}
          className="rounded-[var(--radius-card)] border border-white/[0.06] bg-[var(--color-deep-void)]/40 p-3"
        >
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-data text-[10px] uppercase tracking-wide text-[var(--color-silver-dim)]">
              Rounds {mem.turnRangeStart}–{mem.turnRangeEnd}
            </span>
            <time className="text-data text-[10px] text-[var(--color-silver-dim)]">
              {formatTime(mem.createdAt)}
            </time>
          </div>
          {mem.content.key_events && mem.content.key_events.length > 0 && (
            <div className="mb-1.5">
              <span className="text-[10px] font-semibold uppercase text-[var(--color-silver-dim)]">
                Key Events
              </span>
              <ul className="mt-0.5 space-y-0.5">
                {mem.content.key_events.map((evt, i) => (
                  <li
                    key={i}
                    className="text-xs leading-snug text-[var(--color-silver-muted)]"
                  >
                    — {evt}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mem.content.active_hooks && mem.content.active_hooks.length > 0 && (
            <div className="mb-1.5">
              <span className="text-[10px] font-semibold uppercase text-[var(--color-gold-support)]">
                Active Hooks
              </span>
              <ul className="mt-0.5 space-y-0.5">
                {mem.content.active_hooks.map((hook, i) => (
                  <li
                    key={i}
                    className="text-xs leading-snug text-[var(--color-silver-muted)]"
                  >
                    ! {hook}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mem.content.npc_relationships &&
            mem.content.npc_relationships.length > 0 && (
              <div className="mb-1.5">
                <span className="text-[10px] font-semibold uppercase text-[var(--color-silver-dim)]">
                  NPC Relations
                </span>
                <ul className="mt-0.5 space-y-0.5">
                  {mem.content.npc_relationships.map((rel, i) => (
                    <li
                      key={i}
                      className="text-xs leading-snug text-[var(--color-silver-muted)]"
                    >
                      · {rel}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          {mem.content.world_changes &&
            mem.content.world_changes.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase text-[var(--color-silver-dim)]">
                  World Changes
                </span>
                <ul className="mt-0.5 space-y-0.5">
                  {mem.content.world_changes.map((change, i) => (
                    <li
                      key={i}
                      className="text-xs leading-snug text-[var(--color-silver-muted)]"
                    >
                      ~ {change}
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      ))}
    </section>
  );
}

export function JournalSheet() {
  const feed = useGameStore((s) => s.feed);
  const campaignTitle =
    useGameStore((s) => s.session?.campaignTitle) ?? "Ashveil Chronicle";
  const [publishedStory, setPublishedStory] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = assignRounds(feed);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [feed]);

  function buildPublishedStory(): string {
    const lines: string[] = [];
    lines.push(`# ${campaignTitle}`);
    lines.push("");
    lines.push("A shared chronicle from the adventuring party.");
    lines.push("");
    for (const [round, entries] of groups) {
      lines.push(`## Round ${round}`);
      for (const entry of entries) {
        const who =
          entry.playerName ??
          (entry.type === "narration"
            ? "Narrator"
            : entry.type === "system"
              ? "System"
              : "Party");
        lines.push(`- ${who}: ${entry.text}`);
        if (entry.detail) {
          lines.push(`  - ${entry.detail}`);
        }
      }
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  async function handleCopyStory() {
    if (!publishedStory) return;
    try {
      await navigator.clipboard.writeText(publishedStory);
      setCopyHint("Story copied");
    } catch {
      setCopyHint("Copy failed");
    }
    setTimeout(() => setCopyHint(null), 1800);
  }

  return (
    <div className="space-y-[var(--void-gap)] pb-6">
      <QuestPins />
      <MemorySummaries />

      <section className="rounded-[var(--radius-card)] border border-white/[0.08] bg-[var(--glass-bg)]/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton
            type="button"
            size="sm"
            className="min-h-[40px]"
            onClick={() => setPublishedStory(buildPublishedStory())}
          >
            Publish Story Draft
          </GhostButton>
          <GhostButton
            type="button"
            size="sm"
            className="min-h-[40px]"
            onClick={() => void handleCopyStory()}
            disabled={!publishedStory}
          >
            Copy Draft
          </GhostButton>
          {copyHint ? (
            <span className="text-data text-[11px] text-[var(--color-silver-dim)]">
              {copyHint}
            </span>
          ) : null}
        </div>
        {publishedStory ? (
          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-[var(--radius-chip)] border border-white/[0.08] bg-black/25 p-3 text-xs leading-relaxed text-[var(--color-silver-muted)]">
            {publishedStory}
          </pre>
        ) : null}
      </section>

      {groups.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-silver-dim)]">
          No journal entries yet.
        </p>
      ) : (
        groups.map(([round, entries]) => (
          <section key={round}>
            <div className="sticky top-0 z-[1] -mx-1 mb-3 border-b border-white/[0.06] bg-[var(--color-obsidian)]/95 px-1 py-2 backdrop-blur-md">
              <h3 className="text-fantasy text-sm tracking-wide text-[var(--color-silver-muted)]">
                Round {round}
              </h3>
            </div>
            <ul className="space-y-3">
              {entries.map((entry) => {
                const time = formatTime(entry.timestamp);
                const who =
                  entry.playerName ??
                  (entry.type === "narration"
                    ? "Narrator"
                    : entry.type === "system"
                      ? "System"
                      : "—");

                return (
                  <li
                    key={entry.id}
                    className="flex gap-3 border-b border-white/[0.04] pb-3 last:border-0"
                  >
                    <span className="text-data mt-0.5 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[var(--radius-chip)] border border-white/10 bg-[var(--color-deep-void)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-silver-dim)]">
                      {typeLabel(entry.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-data text-xs text-[var(--color-silver-muted)]">
                          {who}
                        </span>
                        <time
                          className="text-data text-[10px] tabular-nums text-[var(--color-silver-dim)]"
                          dateTime={entry.timestamp}
                        >
                          {time}
                        </time>
                      </div>
                      {entry.type === "narration" ? (
                        <p className="text-fantasy text-sm italic leading-relaxed text-[var(--color-silver-muted)]">
                          {entry.text}
                        </p>
                      ) : (
                        <p className="text-sm leading-snug text-[var(--color-silver-muted)]">
                          {entry.text}
                        </p>
                      )}
                      {entry.detail && (
                        <p className="text-data mt-1 text-xs text-[var(--color-silver-dim)]">
                          {entry.detail}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
