"use client";

import type { InAppMessage } from "@shared/lib/inAppMessages";

import { useLanguage } from "@/components/LanguageProvider";
import { useProfile } from "@/lib/settings/useProfile";

import { useInAppMessageActions, useInAppMessages } from "./controller";
import { AlertPresenter, FullscreenPresenter, SheetPresenter, type PresenterProps } from "./Presenters";
import { useMessageView } from "./useMessageView";

/** A required message can lock an admin out of the admin pages, so only then is the admin flag looked up (ADR 023). */
function RequiredFullscreen({ onAdminHide, ...props }: PresenterProps & { onAdminHide: () => void }) {
  const { isAdmin } = useProfile();
  return <FullscreenPresenter {...props} onAdminHide={isAdmin ? onAdminHide : undefined} />;
}

function Presenter({ message }: { message: InAppMessage }) {
  const { language } = useLanguage();
  const view = useMessageView(message, language);
  const { onClose, onPress, onShown, onAdminHide } = useInAppMessageActions(message);
  const handlers = { onClose, onPress };
  switch (view.presentation) {
    case "alert":
      return <AlertPresenter view={view} handlers={handlers} onShown={onShown} />;
    case "sheet":
      return <SheetPresenter view={view} handlers={handlers} onShown={onShown} />;
    case "fullscreen":
      return message.required ? (
        <RequiredFullscreen view={view} handlers={handlers} onShown={onShown} onAdminHide={onAdminHide} />
      ) : (
        <FullscreenPresenter view={view} handlers={handlers} onShown={onShown} />
      );
    default:
      // Banners are drawn by <InAppMessageBanner /> in the app shell.
      return null;
  }
}

/**
 * Mounted once for every page (app/providers.tsx). Fetches the messages that target the signed-in person and shows
 * the one on screen for the modal ways of showing (alert, sheet, full screen). Nothing shows before sign-in, or on
 * the sign-in pages.
 */
export function InAppMessageHost() {
  const message = useInAppMessages();
  if (!message) return null;
  return <Presenter key={message.id} message={message} />;
}
