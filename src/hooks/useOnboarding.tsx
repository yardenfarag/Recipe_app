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

import {
  isOnboardingCompleteValue,
  ONBOARDING_COMPLETE_KEY,
} from '@/lib/onboardingStorage';

type OnboardingContextValue = {
  /** True after AsyncStorage has been read. */
  ready: boolean;
  /** True once the user finished or skipped first-run onboarding on this install. */
  completed: boolean;
  completeOnboarding: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
        if (!cancelled) {
          setCompleted(isOnboardingCompleteValue(saved));
        }
      } catch {
        // Treat as incomplete — show onboarding.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    setCompleted(true);
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    } catch {
      // Still keep in-memory completed so this session is not stuck.
    }
  }, []);

  const value = useMemo(
    () => ({ ready, completed, completeOnboarding }),
    [ready, completed, completeOnboarding],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
}
