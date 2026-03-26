"use client";

import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_SESSION_UI_MODE,
  readSessionUiModeFromStorage,
  type SessionUiMode,
  writeSessionUiModeToStorage,
} from "@/lib/state/session-ui-mode";

export function useSessionUiMode(): {
  mode: SessionUiMode;
  setMode: (mode: SessionUiMode) => void;
} {
  const [mode, setModeState] =
    useState<SessionUiMode>(DEFAULT_SESSION_UI_MODE);

  useEffect(() => {
    setModeState(readSessionUiModeFromStorage());
  }, []);

  const setMode = useCallback((next: SessionUiMode) => {
    setModeState(next);
    writeSessionUiModeToStorage(next);
  }, []);

  return { mode, setMode };
}
