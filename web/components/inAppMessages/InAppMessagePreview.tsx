"use client";

import type { ReactNode } from "react";

import type { InAppMessage } from "@shared/lib/inAppMessages";

import { cn } from "@/lib/cn";

import { BannerPresenter } from "./BannerPresenter";
import type { MessageHandlers } from "./MessageBody";
import { ALERT_CARD_CLASS, AlertCard, FullscreenPage, SheetPanel } from "./Presenters";
import { messageDir, useMessageView } from "./useMessageView";

const inertHandlers: MessageHandlers = { onPress: () => {}, onClose: () => {} };

/**
 * One in-app message drawn as the new web app shows it (banner, alert, sheet or full screen), but inline and inert:
 * for the admin composer's preview (PIN-144). It is built from the live messages' own parts (Presenters,
 * BannerPresenter), so what an admin sees is what people get: the tone, the right-to-left layout of Hebrew and Arabic
 * content, the "Update" button a required message always gets and the Close button an alert may need. Nothing in it
 * can be focused or pressed, and nothing is recorded.
 *
 * Contract: keep these props. `language` picks the content (falling back to 'en').
 */
export function InAppMessagePreview({ message, language }: { message: InAppMessage; language: string }) {
  const view = useMessageView(message, language);
  const own = { dir: messageDir(view), lang: view.contentLanguage };

  let frame: ReactNode;
  switch (view.presentation) {
    case "banner":
      frame = (
        <div className="p-3">
          <BannerPresenter view={view} handlers={inertHandlers} edge={message.bannerPosition ?? "top"} />
        </div>
      );
      break;
    case "sheet":
      frame = (
        <div {...own} className="ms-auto flex max-h-[32rem] w-full max-w-md flex-col rounded-2xl bg-surface shadow-lift">
          <SheetPanel view={view} handlers={inertHandlers} />
        </div>
      );
      break;
    case "fullscreen":
      frame = (
        <div {...own} className="min-h-[28rem] overflow-hidden rounded-2xl bg-bg">
          <FullscreenPage view={view} handlers={inertHandlers} />
        </div>
      );
      break;
    default:
      frame = (
        <div className="grid place-items-center p-4">
          <div {...own} className={ALERT_CARD_CLASS}>
            <AlertCard view={view} handlers={inertHandlers} />
          </div>
        </div>
      );
  }

  return (
    <div
      inert
      data-presentation={view.presentation}
      className={cn(
        "overflow-hidden rounded-tile border border-border",
        view.presentation === "banner" ? "bg-bg" : "bg-overlay p-3",
      )}
    >
      {frame}
    </div>
  );
}
