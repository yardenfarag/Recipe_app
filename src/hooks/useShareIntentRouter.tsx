import { router, usePathname } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';

import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * Watches for an incoming OS share (ADR 010) and routes to the Snap tab,
 * which owns consuming + auto-submitting the shared link. Lives at the
 * root so a share reaches Snap regardless of which screen is on top.
 * A share that arrives before the account exists waits. Preferences and
 * sign-up finish first, then Snap consumes the share.
 */
export function ShareIntentRouter() {
  const { hasShareIntent } = useShareIntentContext();
  const pathname = usePathname();
  const { ready, completed } = useOnboarding();

  useEffect(() => {
    if (!hasShareIntent || !ready || !completed) return;
    if (pathname !== '/add') router.replace('/add');
  }, [hasShareIntent, ready, completed, pathname]);

  return null;
}
