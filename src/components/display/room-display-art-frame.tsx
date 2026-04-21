"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface RoomDisplayArtFrameProps {
  /** `naturalWidth / naturalHeight` from the loaded scene image; null = fill parent. */
  naturalAspect: number | null;
  children: ReactNode;
  className?: string;
}

/**
 * Sizes the art cell to the loaded image aspect ratio so `object-contain` fills it
 * with almost no pillarboxing, while staying inside the browser / TV panel.
 */
export function RoomDisplayArtFrame({
  naturalAspect,
  children,
  className = "",
}: RoomDisplayArtFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function measure() {
      const node = containerRef.current;
      if (!node) return;
      const pw = node.clientWidth;
      const ph = node.clientHeight;
      if (pw <= 2 || ph <= 2) return;

      if (!naturalAspect || naturalAspect <= 0) {
        setDims(null);
        return;
      }

      let w = pw;
      let h = w / naturalAspect;
      if (h > ph) {
        h = ph;
        w = h * naturalAspect;
      }
      setDims({ w: Math.floor(w), h: Math.floor(h) });
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [naturalAspect]);

  const fit =
    naturalAspect &&
    naturalAspect > 0 &&
    dims &&
    dims.w > 0 &&
    dims.h > 0
      ? dims
      : null;

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-transparent ${className}`}
    >
      {fit ? (
        <div
          className="relative overflow-hidden rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--color-deep-void)_78%,transparent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(255,255,255,0.06),0_24px_48px_rgba(0,0,0,0.38)] backdrop-blur-sm"
          style={{ width: fit.w, height: fit.h }}
        >
          <div className="absolute inset-0">{children}</div>
        </div>
      ) : (
        <div className="relative h-full min-h-0 w-full flex-1 overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}
