"use client";

import { useMemo, useState } from "react";

import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";

function isGuestEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.endsWith("@ashveil.guest");
}

export function TutorialOverlay(props: {
  moduleKey: string | null | undefined;
  myActionCount: number;
  currentTurnIndex: number;
  userEmail?: string | null;
  onFinish: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const isTutorial = props.moduleKey === "tutorial_v1";

  const step = useMemo(() => {
    if (!isTutorial) return null;
    if (props.myActionCount <= 0) return 0;
    if (props.myActionCount === 1) return 1;
    if (props.myActionCount === 2) return 2;
    return 3;
  }, [isTutorial, props.myActionCount]);

  const complete = step === 3;

  if (!isTutorial || dismissed) return null;

  const copy =
    step === 0
      ? {
          title: "Your first turn",
          body: "Type an intent. Try: “I search the altar for clues.”",
        }
      : step === 1
        ? {
            title: "Trigger the dice",
            body: "Try something risky so the system rolls. Example: “I force the sealed door.”",
          }
        : step === 2
          ? {
              title: "One bold choice",
              body: "Do something dramatic: “I bargain with the shadow” or “I leap the chasm.”",
            }
          : {
              title: "Tutorial complete",
              body: "You’re ready. Start a real adventure — your profile and sessions will persist.",
            };

  const showUpgradeNudge =
    complete && isGuestEmail(props.userEmail) && props.currentTurnIndex >= 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto w-full max-w-md rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.25)] bg-[var(--surface-high)]/90 backdrop-blur-md p-4 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-rare)]/80">
              Tutorial
            </p>
            <h3 className="text-fantasy text-base text-[var(--color-silver-muted)]">
              {copy.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="min-h-[36px] px-3 rounded-[var(--radius-chip)] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--outline)] hover:text-[var(--color-gold-rare)] transition-colors"
          >
            Hide
          </button>
        </div>
        <p className="mt-2 text-sm text-[var(--color-silver-dim)] leading-relaxed">
          {copy.body}
        </p>

        {showUpgradeNudge ? (
          <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
            Tip: sign in with Google on the home screen to keep your adventures across devices.
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-3">
          {complete ? (
            <GoldButton
              type="button"
              size="md"
              className="flex-1 min-h-[44px]"
              onClick={() => {
                try {
                  window.localStorage.setItem("falvos.tutorial.complete", "1");
                } catch {
                  /* ignore */
                }
                props.onFinish();
              }}
            >
              Start real adventure
            </GoldButton>
          ) : (
            <GhostButton
              type="button"
              className="flex-1 min-h-[44px] text-[10px] font-bold uppercase tracking-[0.15em]"
              onClick={() => setDismissed(true)}
            >
              Got it
            </GhostButton>
          )}
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--outline)]">
            Step {Math.min((step ?? 0) + 1, 4)}/4
          </span>
        </div>
      </div>
    </div>
  );
}

