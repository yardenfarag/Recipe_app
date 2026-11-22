import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  createSpeechQueue,
  READ_ALOUD_STORAGE_KEY,
  type ReadAloudVoice,
  type SpeechEngine,
  type SpeechQueue,
} from '@shared/lib/readAloud';

const engine: SpeechEngine = {
  speak(text, { language, voiceId, onDone, onError }) {
    Speech.speak(text, {
      language,
      voice: voiceId,
      onDone,
      onError: () => onError(),
      // Speech.stop() reports the cut-off utterance here; the queue has already moved on, so nothing to do.
      onStopped: () => undefined,
    });
  },
  stop() {
    void Speech.stop().catch(() => undefined);
  },
};

async function deviceVoices(): Promise<ReadAloudVoice[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.map((voice) => ({
      id: voice.identifier,
      language: voice.language,
      name: voice.name,
      enhanced: voice.quality === Speech.VoiceQuality.Enhanced,
    }));
  } catch {
    return [];
  }
}

/**
 * Reads cook mode aloud with the phone's own voices (expo-speech). `voices` is null until the phone has listed
 * them, and stays null when it lists none (some Android engines, before they warm up): then we try with the
 * language tag alone. Speech stops when `active` turns off (cook mode closed), when the app leaves the
 * foreground, and on unmount.
 */
export function useReadAloud(active: boolean): { voices: ReadAloudVoice[] | null; queue: SpeechQueue } {
  const queue = useMemo(() => createSpeechQueue(engine), []);
  const [voices, setVoices] = useState<ReadAloudVoice[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void deviceVoices().then((list) => {
      if (!cancelled) setVoices(list.length > 0 ? list : null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      queue.stop();
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') queue.stop();
    });
    return () => {
      subscription.remove();
      queue.stop();
    };
  }, [active, queue]);

  return { voices, queue };
}

/** Whether cook mode reads steps aloud. Off until turned on; remembered on this device (same key as web). */
export function useReadAloudPreference(): [boolean, (on: boolean) => void] {
  const [on, setOnState] = useState(false);
  const userSet = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(READ_ALOUD_STORAGE_KEY);
        if (!cancelled && !userSet.current) setOnState(saved === 'on');
      } catch {
        // Unreadable storage: stay off.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setOn = useCallback((next: boolean) => {
    userSet.current = true;
    setOnState(next);
    AsyncStorage.setItem(READ_ALOUD_STORAGE_KEY, next ? 'on' : 'off').catch(() => undefined);
  }, []);

  return [on, setOn];
}
