import { router, usePathname, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * The app requires an account. Incomplete installs stay on `/onboarding` or
 * the account screen; finished installs without a session (signed out,
 * expired, deleted) go to sign-in.
 * On native, a finished install leaves `/onboarding`. On web that page stays
 * open so it can be viewed again. The public intro is the static page at
 * pinch-app.io/, outside the app.
 */
export function OnboardingGate() {
  const { ready, completed } = useOnboarding();
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const segments = useSegments();

  useEffect(() => {
    if (!ready || authLoading) return;

    const onOnboarding = segments[0] === 'onboarding' || pathname === '/onboarding';
    const onWelcome = pathname === '/welcome';
    const onLegal = pathname === '/legal' || pathname.startsWith('/legal/');
    const onAuth =
      segments[0] === 'auth' ||
      segments[0] === 'auth-callback' ||
      segments[0] === 'reset-password' ||
      pathname === '/auth' ||
      pathname.startsWith('/auth-callback') ||
      pathname === '/reset-password';

    if (onWelcome || onLegal) return;

    if (!completed && !onOnboarding && !onAuth) {
      router.replace('/onboarding');
      return;
    }

    if (completed && !user && !onOnboarding && !onAuth) {
      router.replace('/auth?mode=signin');
      return;
    }

    if (completed && onOnboarding && Platform.OS !== 'web') {
      router.replace('/(tabs)');
    }
  }, [ready, completed, authLoading, user, pathname, segments]);

  return null;
}
