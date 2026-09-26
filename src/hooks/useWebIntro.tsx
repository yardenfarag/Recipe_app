import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { isWebIntroDismissedValue, WEB_INTRO_DISMISSED_KEY } from '@/lib/webIntro';

type WebIntroContextValue = {
  ready: boolean;
  dismissed: boolean;
  dismiss: () => Promise<void>;
};

const WebIntroContext = createContext<WebIntroContextValue | null>(null);

export function WebIntroProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(WEB_INTRO_DISMISSED_KEY);
        if (!cancelled) setDismissed(isWebIntroDismissedValue(saved));
      } catch {
        // Treat as not dismissed so a first visit still sees the intro.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(async () => {
    setDismissed(true);
    try {
      await AsyncStorage.setItem(WEB_INTRO_DISMISSED_KEY, 'true');
    } catch {
      // In-memory flag still lets this session into the app.
    }
  }, []);

  const value = useMemo(() => ({ ready, dismissed, dismiss }), [ready, dismissed, dismiss]);

  return <WebIntroContext.Provider value={value}>{children}</WebIntroContext.Provider>;
}

export function useWebIntro() {
  const ctx = useContext(WebIntroContext);
  if (!ctx) {
    throw new Error('useWebIntro must be used within WebIntroProvider');
  }
  return ctx;
}
