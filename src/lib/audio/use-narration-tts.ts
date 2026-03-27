"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  if (!("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

const FEMALE_VOICE_HINTS = [
  "female",
  "woman",
  "zira",
  "samantha",
  "victoria",
  "karen",
  "ava",
  "lisa",
  "aria",
];

export interface NarrationPlaybackState {
  isSupported: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  activeText: string | null;
}

const fallbackState: NarrationPlaybackState = {
  isSupported: false,
  isSpeaking: false,
  isPaused: false,
  activeText: null,
};

let playbackState: NarrationPlaybackState = {
  ...fallbackState,
  isSupported: typeof window !== "undefined" && "speechSynthesis" in window,
};

const playbackListeners = new Set<() => void>();

function updatePlaybackState(next: Partial<NarrationPlaybackState>) {
  playbackState = { ...playbackState, ...next };
  playbackListeners.forEach((fn) => fn());
}

function pickPreferredVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (voices.length === 0) return null;

  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : voices;

  const female = pool.find((voice) => {
    const key = `${voice.name} ${voice.voiceURI}`.toLowerCase();
    return FEMALE_VOICE_HINTS.some((hint) => key.includes(hint));
  });

  return female ?? pool[0] ?? null;
}

export function subscribeNarrationPlayback(listener: () => void): () => void {
  playbackListeners.add(listener);
  return () => playbackListeners.delete(listener);
}

export function getNarrationPlaybackState(): NarrationPlaybackState {
  return playbackState;
}

export function useNarrationPlayback(): NarrationPlaybackState {
  return useSyncExternalStore(
    subscribeNarrationPlayback,
    getNarrationPlaybackState,
    () => fallbackState,
  );
}

export function speakNarrationText(text: string): boolean {
  const synth = getSynth();
  const trimmed = text.trim();
  if (!synth || !trimmed) return false;

  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(trimmed);
  const preferredVoice = pickPreferredVoice(synth);
  if (preferredVoice) {
    utterance.voice = preferredVoice;
    utterance.lang = preferredVoice.lang;
  }
  utterance.rate = 1.08;
  utterance.pitch = 1.08;
  utterance.volume = 1;
  utterance.onstart = () => {
    updatePlaybackState({
      isSupported: true,
      isSpeaking: true,
      isPaused: false,
      activeText: trimmed,
    });
  };
  utterance.onend = () => {
    updatePlaybackState({
      isSupported: true,
      isSpeaking: false,
      isPaused: false,
      activeText: null,
    });
  };
  utterance.onerror = () => {
    updatePlaybackState({
      isSupported: true,
      isSpeaking: false,
      isPaused: false,
      activeText: null,
    });
  };
  updatePlaybackState({
    isSupported: true,
    isSpeaking: true,
    isPaused: false,
    activeText: trimmed,
  });
  synth.speak(utterance);
  return true;
}

export function stopNarrationSpeech() {
  const synth = getSynth();
  if (!synth) return;
  synth.cancel();
  updatePlaybackState({
    isSupported: true,
    isSpeaking: false,
    isPaused: false,
    activeText: null,
  });
}

export function toggleNarrationPlayback(text: string): boolean {
  const synth = getSynth();
  const trimmed = text.trim();
  if (!synth || !trimmed) return false;

  const sameText = playbackState.activeText === trimmed;
  if (sameText && synth.speaking) {
    if (synth.paused || playbackState.isPaused) {
      synth.resume();
      updatePlaybackState({ isSupported: true, isSpeaking: true, isPaused: false });
    } else {
      synth.pause();
      updatePlaybackState({ isSupported: true, isSpeaking: true, isPaused: true });
    }
    return true;
  }

  return speakNarrationText(trimmed);
}

export interface NarrationTtsControls {
  isSupported: boolean;
  isSpeaking: boolean;
  speak: (text: string) => boolean;
  stop: () => void;
}

export function useNarrationTts(): NarrationTtsControls {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playback = useNarrationPlayback();

  const isSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }, []);

  const stop = useCallback(() => {
    stopNarrationSpeech();
    utteranceRef.current = null;
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

      utterance.onstart = () => {
        updatePlaybackState({
          isSupported: true,
          isSpeaking: true,
          isPaused: false,
          activeText: trimmed,
        });
      };
      utterance.onend = () => {
        utteranceRef.current = null;
        updatePlaybackState({
          isSupported: true,
          isSpeaking: false,
          isPaused: false,
          activeText: null,
        });
      };
      utterance.onerror = () => {
        utteranceRef.current = null;
        updatePlaybackState({
          isSupported: true,
          isSpeaking: false,
          isPaused: false,
          activeText: null,
        });
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
    isSpeaking: playback.isSpeaking,
    speak,
    stop,
  };
}
