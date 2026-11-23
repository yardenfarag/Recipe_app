import { router, usePathname } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/hooks/useOnboarding';
import { claimShare } from '@/lib/shareIntentClaim';
import { whatsAppExportInShare } from '@/lib/whatsappImport/shareRouting';

/**
 * Watches for an incoming OS share (ADR 010) and routes to the Snap tab,
 * which owns consuming + auto-submitting the shared link. Lives at the
 * root so a share reaches Snap regardless of which screen is on top.
 * A share that arrives before the account exists waits. Preferences and
 * sign-up finish first, then Snap consumes the share.
 *
 * A WhatsApp chat export (ADR 032) goes to the WhatsApp import screen
 * instead, with the file. That screen asks a guest to sign in and then
 * opens the file, so the share is taken here and cleared.
 */
export function ShareIntentRouter() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const pathname = usePathname();
  const { ready, completed } = useOnboarding();
  // Wait for the session to hydrate so Snap sees the real user on cold start.
  const { loading: authLoading } = useAuth();

  useEffect(() => {
    if (!hasShareIntent || !ready || !completed || authLoading) return;
    const chat = whatsAppExportInShare(shareIntent.files);
    if (chat) {
      if (!claimShare(`whatsapp:${chat.uri}`)) return;
      resetShareIntent();
      const params = { file: chat.uri, name: chat.name, size: chat.size != null ? String(chat.size) : '' };
      if (pathname === '/whatsapp-import') router.setParams(params);
      else router.push({ pathname: '/whatsapp-import', params });
      return;
    }
    if (pathname !== '/add') router.dismissTo('/add');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent, shareIntent.files, ready, completed, authLoading, pathname]);

  return null;
}
