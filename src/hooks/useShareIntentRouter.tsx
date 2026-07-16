import { router, usePathname } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';

/**
 * Watches for an incoming OS share (ADR 010) and routes to the Snap tab,
 * which owns consuming + auto-submitting the shared link. Lives at the
 * root so a share reaches Snap regardless of which screen is on top.
 */
export function ShareIntentRouter() {
  const { hasShareIntent } = useShareIntentContext();
  const pathname = usePathname();

  useEffect(() => {
    if (hasShareIntent && pathname !== '/add') {
      router.replace('/add');
    }
  }, [hasShareIntent, pathname]);

  return null;
}
