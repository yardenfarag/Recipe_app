"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { createSpeechQueue, READ_ALOUD_STORAGE_KEY, type ReadAloudVoice, type SpeechEngine, type SpeechQueue } from "@shared/lib/readAloud";

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return null;
  return window.speechSynthesis;
}

export function readAloudSupported(): boolean {
  return synth() !== null;
}

function browserVoices(): ReadAloudVoice[] {
  return (synth()?.getVoices() ?? []).map((voice) => ({
    id: voice.voiceURI,
    language: voice.lang,
    name: voice.name,
    local: voice.localService,
    isDefault: voice.default,
  }));
}

const noSubscribe = () => () => undefined;

// Chrome can drop an utterance that nothing references before it ends, and then never fires `end`.
let speaking: SpeechSynthesisUtterance | null = null;

const engine: SpeechEngine = {
  speak(text, { language, voiceId, onDone, onError }) {
    const speech = synth();
    if (!speech) throw new Error("speechSynthesis is unavailable");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    const voice = voiceId ? speech.getVoices().find((item) => item.voiceURI === voiceId) : undefined;
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      if (speaking === utterance) speaking = null;
      onDone();
    };
    utterance.onerror = () => {
      if (speaking === utterance) speaking = null;
      onError();
    };
    speaking = utterance;
    speech.speak(utterance);
  },
  stop() {
    speaking = null;
    synth()?.cancel();
  },
};

/**
 * Reads cook mode aloud with the browser's own voices (`speechSynthesis`). `voices` is null until the browser has
 * listed them (Chrome fills the list late and says so with `voiceschanged`). Speech stops when `active` turns off
 * (cook mode closed), when the tab is hidden, and on unmount.
 */
export function useReadAloud(active: boolean): {
  supported: boolean;
  voices: ReadAloudVoice[] | null;
  queue: SpeechQueue;
} {
  const queue = useMemo(() => createSpeechQueue(engine), []);
  // False on the server and in the first client render, so the markup matches.
  const supported = useSyncExternalStore(noSubscribe, readAloudSupported, () => false);
  // Read at once where the browser already has the list, so a step isn't started twice (no voice, then the voice).
  const [voices, setVoices] = useState<ReadAloudVoice[] | null>(() => (synth() ? browserVoices() : null));

  useEffect(() => {
    const speech = synth();
    if (!speech) return;
    const update = () => setVoices(browserVoices());
    update();
    speech.addEventListener?.("voiceschanged", update);
    return () => speech.removeEventListener?.("voiceschanged", update);
  }, []);

  useEffect(() => {
    if (!active) {
      queue.stop();
      return;
    }
    const onHide = () => {
      if (document.visibilityState === "hidden") queue.stop();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", queue.stop);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", queue.stop);
      queue.stop();
    };
  }, [active, queue]);

  return { supported, voices: voices && voices.length > 0 ? voices : null, queue };
}

const listeners = new Set<() => void>();
/** The choice when storage is blocked: it lasts until the page closes. */
let memory = false;

function readPreference(): boolean {
  try {
    return window.localStorage.getItem(READ_ALOUD_STORAGE_KEY) === "on";
  } catch {
    return memory;
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

/** Whether cook mode reads steps aloud. Off until turned on; remembered in this browser (same key as mobile). */
export function useReadAloudPreference(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readPreference, () => false);
  const setOn = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(READ_ALOUD_STORAGE_KEY, next ? "on" : "off");
    } catch {
      memory = next;
    }
    for (const listener of listeners) listener();
  }, []);
  return [on, setOn];
}
