"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { InAppMessage } from "@shared/lib/inAppMessages";
import { buildMessageView, type MessageView } from "@shared/lib/inAppMessageView";

/**
 * The message worked out for a language (shared/lib/inAppMessageView.ts, the mobile app's rules), with the app's
 * default labels ("Update", "Learn more", "Close"). Direction follows the language the message is shown in.
 */
export function useMessageView(message: InAppMessage, language: string): MessageView {
  const { t } = useTranslation();
  const update = t("inAppMessages.update");
  const learnMore = t("inAppMessages.learnMore");
  const close = t("inAppMessages.close");
  return useMemo(
    () => buildMessageView(message, language, { update, learnMore, close }),
    [message, language, update, learnMore, close],
  );
}

export function messageDir(view: MessageView): "rtl" | "ltr" {
  return view.rtl ? "rtl" : "ltr";
}
