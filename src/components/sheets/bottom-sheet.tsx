"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from "framer-motion";

const DISMISS_Y = 120;
const DISMISS_VY = 450;

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  fullHeight?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  fullHeight = false,
}: BottomSheetProps) {
  const reduced = useReducedMotion();
  const controls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      controls.start(e);
    },
    [controls],
  );

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const transition = reduced
    ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const }
    : { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.85 };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.15 : 0.22 }}
        >
          <button
            type="button"
            aria-label="Close overlay"
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bottom-sheet-title"
            className={`relative z-[1] flex w-full flex-col border-[rgba(77,70,53,0.2)] bg-[var(--color-obsidian)] ${
              fullHeight
                ? "h-dvh max-h-dvh min-h-dvh rounded-none border-0"
                : "max-h-[85vh] min-h-[70vh] rounded-t-[var(--radius-card)] border-t border-x shadow-[0_-12px_48px_rgba(0,0,0,0.55)]"
            }`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={transition}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (
                info.offset.y > DISMISS_Y ||
                info.velocity.y > DISMISS_VY
              ) {
                onClose();
              }
            }}
          >
            <div className="flex shrink-0 flex-col items-center gap-3 border-b border-[rgba(77,70,53,0.15)] px-4 pt-2">
              <div
                className="flex min-h-[44px] w-full cursor-grab touch-none items-center justify-center py-2 active:cursor-grabbing"
                onPointerDown={startDrag}
                aria-hidden
              >
                <div className="h-1 w-10 rounded-full bg-[var(--outline-variant)]" />
              </div>
              <div className="relative flex w-full min-h-[44px] items-center justify-center pb-3">
                <h2
                  id="bottom-sheet-title"
                  className="text-fantasy max-w-[min(100%,18rem)] px-10 text-center text-lg font-black tracking-tight text-[var(--color-silver-muted)]"
                >
                  {title}
                </h2>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  className="absolute right-0 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-[var(--radius-button)] text-[var(--outline)] transition-colors hover:text-[var(--color-gold-rare)]"
                >
                  <span className="material-symbols-outlined text-xl">
                    close
                  </span>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[var(--void-gap)]">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
