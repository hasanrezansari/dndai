"use client";

import { useCallback, useState } from "react";

import {
  readSessionUiModeFromStorage,
  type SessionUiMode,
  writeSessionUiModeToStorage,
} from "@/lib/state/session-ui-mode";

export function useSessionUiMode(): {
  mode: SessionUiMode;
  setMode: (mode: SessionUiMode) => void;
} {
  const [mode, setModeState] = useState<SessionUiMode>(() =>
    readSessionUiModeFromStorage(),
  );

  const setMode = useCallback((next: SessionUiMode) => {
    setModeState(next);
    writeSessionUiModeToStorage(next);
  }, []);

  return { mode, setMode };
}
