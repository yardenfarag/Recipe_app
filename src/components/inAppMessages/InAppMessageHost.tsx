import { useGlobalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';

import { inAppMessagesController, useInAppMessageActions, useInAppMessages } from '@/hooks/useInAppMessages';

import { AlertPresenter } from './AlertPresenter';
import { FullscreenPresenter } from './FullscreenPresenter';
import { SAMPLE_MESSAGES } from './samples';
import { SheetPresenter } from './SheetPresenter';
import { useMessageView } from './useMessageView';
import type { InAppMessage } from '@/lib/inAppMessages';

function Presenter({ message }: { message: InAppMessage }) {
  const view = useMessageView(message);
  const { onAction, onClose } = useInAppMessageActions(message);
  switch (view.presentation) {
    case 'alert':
      return <AlertPresenter key={message.id} view={view} onAction={onAction} onClose={onClose} />;
    case 'sheet':
      return <SheetPresenter key={message.id} view={view} onAction={onAction} onClose={onClose} />;
    case 'fullscreen':
      return <FullscreenPresenter key={message.id} view={view} onAction={onAction} onClose={onClose} />;
    default:
      // Banners are drawn by <InAppMessageBanner /> inside the tabs layout.
      return null;
  }
}

/**
 * Mounted once in the root layout. Runs the fetching (`useInAppMessages`) and
 * shows the message on screen for the modal ways of showing: alert, sheet and
 * full screen. Nothing shows before sign-in.
 *
 * Dev only: open the app with `?inAppSample=alert|alert-image|sheet|banner|
 * banner-bottom|fullscreen|required` (a URL query on web, a deep link such as
 * `exp://…/--/?inAppSample=sheet` on a phone) to see a presenter with a
 * hard-coded message. Samples record nothing.
 */
export function InAppMessageHost() {
  const message = useInAppMessages();
  const { inAppSample } = useGlobalSearchParams<{ inAppSample?: string }>();

  const previewing = useRef(false);
  useEffect(() => {
    if (!__DEV__) return;
    const sample = typeof inAppSample === 'string' ? SAMPLE_MESSAGES[inAppSample] : undefined;
    if (!sample && !previewing.current) return;
    previewing.current = Boolean(sample);
    inAppMessagesController.preview(sample ?? null);
  }, [inAppSample]);

  if (!message) return null;
  return <Presenter message={message} />;
}
