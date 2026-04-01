"use client";

import { useCallback, useState } from "react";

const STORAGE_KEY = "ashveil.guidedTurnUi";

function readStoredGuided(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "0" || v === "false") return false;
  if (v === "1" || v === "true") return true;
  return true;
}

/**
 * Guided mode: turn hint, four intent chips, optional target sheet. Fast mode: text + submit only.
 */
export function useGuidedTurnUi() {
  const [guidedTurnUi, setGuidedState] = useState(() => readStoredGuided());

  const setGuidedTurnUi = useCallback((guided: boolean) => {
    setGuidedState(guided);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, guided ? "1" : "0");
    }
  }, []);

  const toggleGuidedTurnUi = useCallback(() => {
    setGuidedState((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }, []);

  return {
    guidedTurnUi,
    setGuidedTurnUi,
    toggleGuidedTurnUi,
  };
}
