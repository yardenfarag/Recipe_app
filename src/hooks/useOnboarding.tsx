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
import { isWalkthroughPendingValue, WALKTHROUGH_STATE_KEY } from '@/lib/walkthroughStorage';

type OnboardingContextValue = {
  /** True after AsyncStorage has been read. */
  ready: boolean;
  /** True once the user finished or skipped first-run onboarding on this install. */
  completed: boolean;
  completeOnboarding: () => Promise<void>;
  /** True from onboarding until the tab walkthrough is finished or skipped. */
  walkthroughPending: boolean;
  finishWalkthrough: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [walkthroughPending, setWalkthroughPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [saved, walkthrough] = await Promise.all([
          AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY),
          AsyncStorage.getItem(WALKTHROUGH_STATE_KEY),
        ]);
        if (!cancelled) {
          setCompleted(isOnboardingCompleteValue(saved));
          setWalkthroughPending(isWalkthroughPendingValue(walkthrough));
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
    setWalkthroughPending(true);
    try {
      await AsyncStorage.multiSet([
        [ONBOARDING_COMPLETE_KEY, 'true'],
        [WALKTHROUGH_STATE_KEY, 'pending'],
      ]);
    } catch {
      // Still keep in-memory completed so this session is not stuck.
    }
  }, []);

  const finishWalkthrough = useCallback(async () => {
    setWalkthroughPending(false);
    try {
      await AsyncStorage.setItem(WALKTHROUGH_STATE_KEY, 'done');
    } catch {
      // Hidden for this session; it may show again on next launch.
    }
  }, []);

  const value = useMemo(
    () => ({ ready, completed, completeOnboarding, walkthroughPending, finishWalkthrough }),
    [ready, completed, completeOnboarding, walkthroughPending, finishWalkthrough],
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
