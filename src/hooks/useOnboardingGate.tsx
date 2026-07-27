import { router, usePathname, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * Keeps first-run onboarding as a one-time gate: incomplete installs stay on
 * `/onboarding`; completed installs never return there.
 * Share intents are owned by ShareIntentRouter (skip redirect while on Snap).
 */
export function OnboardingGate() {
  const { ready, completed } = useOnboarding();
  const pathname = usePathname();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;

    const onOnboarding = segments[0] === 'onboarding' || pathname === '/onboarding';
    const onSnap = pathname === '/add' || segments.includes('add');

    // Let ShareIntentRouter own first-open shares — do not yank away from Snap.
    if (!completed && !onOnboarding && !onSnap) {
      router.replace('/onboarding');
      return;
    }

    if (completed && onOnboarding) {
      router.replace('/(tabs)');
    }
  }, [ready, completed, pathname, segments]);

  return null;
}
