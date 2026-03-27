"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  if (!("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

export interface NarrationTtsControls {
  isSupported: boolean;
  isSpeaking: boolean;
  speak: (text: string) => boolean;
  stop: () => void;
}

export function useNarrationTts(): NarrationTtsControls {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }, []);

  const stop = useCallback(() => {
    const synth = getSynth();
    if (!synth) return;
    synth.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      const synth = getSynth();
      const trimmed = text.trim();
      if (!synth || !trimmed) return false;

      // Keep only one narration active at a time.
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        utteranceRef.current = null;
        setIsSpeaking(false);
      };
      utterance.onerror = () => {
        utteranceRef.current = null;
        setIsSpeaking(false);
      };

      utteranceRef.current = utterance;
      synth.speak(utterance);
      return true;
    },
    [],
  );

  useEffect(() => () => stop(), [stop]);

  return {
    isSupported,
    isSpeaking,
    speak,
    stop,
  };
}
