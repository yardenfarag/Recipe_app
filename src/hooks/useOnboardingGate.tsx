import { router, usePathname, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * Keeps first-run onboarding as a one-time gate: incomplete installs stay on
 * `/onboarding` or the account screen; completed installs never return there.
 */
export function OnboardingGate() {
  const { ready, completed } = useOnboarding();
  const pathname = usePathname();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;

    const onOnboarding = segments[0] === 'onboarding' || pathname === '/onboarding';
    const onAuth =
      segments[0] === 'auth' ||
      segments[0] === 'auth-callback' ||
      pathname === '/auth' ||
      pathname.startsWith('/auth-callback');

    if (!completed && !onOnboarding && !onAuth) {
      router.replace('/onboarding');
      return;
    }

    if (completed && onOnboarding) {
      router.replace('/(tabs)');
    }
  }, [ready, completed, pathname, segments]);

  return null;
}
