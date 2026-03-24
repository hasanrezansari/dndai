"use client";

import { useEffect, useState } from "react";

import { getPusherClient } from "@/lib/socket/client";

type Dot = "connected" | "reconnecting" | "disconnected";

export function usePusherConnectionDot(): {
  dot: Dot;
  label: string;
  active: boolean;
} {
  const [dot, setDot] = useState<Dot>("disconnected");
  const [label, setLabel] = useState("Disconnected");

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) {
      return;
    }
    const client = getPusherClient();
    if (!client) return;

    const apply = (current: string, previous: string) => {
      if (current === "connected") {
        setDot("connected");
        setLabel("Connected");
        return;
      }
      if (current === "connecting" || current === "initialized") {
        setDot("reconnecting");
        setLabel(previous === "connected" ? "Reconnecting…" : "Connecting…");
        return;
      }
      setDot("disconnected");
      setLabel("Disconnected");
    };

    const onStateChange = (states: { previous: string; current: string }) => {
      apply(states.current, states.previous);
    };

    client.connection.bind("state_change", onStateChange);
    queueMicrotask(() => apply(client.connection.state, ""));

    return () => {
      client.connection.unbind("state_change", onStateChange);
    };
  }, []);

  const active = Boolean(process.env.NEXT_PUBLIC_PUSHER_KEY);
  return { dot, label, active };
}

const dotColor: Record<Dot, string> = {
  connected: "bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.5)]",
  reconnecting: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.45)]",
  disconnected: "bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.45)]",
};

export function ConnectionStatus() {
  const { dot, label, active } = usePusherConnectionDot();
  const [open, setOpen] = useState(false);

  if (!active) return null;

  return (
    <div className="fixed bottom-20 left-3 z-[90] sm:bottom-24">
      <button
        type="button"
        className="flex items-center gap-2 rounded-full bg-[var(--color-deep-void)]/90 border border-[rgba(255,255,255,0.08)] pl-2 pr-3 py-1.5 backdrop-blur-md min-h-[44px] min-w-[44px] justify-center"
        aria-expanded={open}
        aria-label={`Realtime: ${label}`}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor[dot]}`}
          aria-hidden
        />
        <span
          className={`text-[10px] uppercase tracking-wider text-[var(--color-silver-dim)] transition-all duration-150 ${open ? "opacity-100 max-w-[10rem]" : "opacity-0 max-w-0 overflow-hidden"}`}
        >
          {label}
        </span>
      </button>
    </div>
  );
}
