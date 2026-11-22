"use client";

import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { MessageView } from "@shared/lib/inAppMessageView";

import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";

import { MessageAction, MessageIcon, messageButtonClass, type MessageHandlers } from "./MessageBody";
import { TONE_CLASSES } from "./tone";
import { messageDir } from "./useMessageView";

const TRACK = "in_app_message.banner";

/**
 * A tile in the content column, coloured by the message's tone. It never covers the page or takes focus. The
 * buttons sit beside the text when the strip is wide and under it when narrow (a container query, so it follows the
 * column, not the window). Escape closes a dismissible banner while focus is inside it.
 */
export function BannerPresenter({
  view,
  handlers,
  edge,
}: {
  view: MessageView;
  handlers: MessageHandlers;
  edge: "top" | "bottom";
}) {
  const { t } = useTranslation();
  const { message } = view;
  const tone = TONE_CLASSES[message.tone];
  const hasActions = view.buttons.length > 0 || Boolean(view.link);
  const newTabNote = t("web.recipe.opensInNewTab");

  return (
    <section
      aria-label={t("inAppMessages.region")}
      dir={messageDir(view)}
      lang={view.contentLanguage}
      onKeyDown={(event) => {
        if (event.key === "Escape" && view.dismissible) handlers.onClose();
      }}
      // A tile in the tone's colours. Stuck to the bottom of the window it floats over the page, so it gets a shadow.
      className={cn("@container w-full rounded-3xl border", tone.soft, tone.border, edge === "bottom" && "shadow-lift")}
    >
      <div className="flex w-full items-start gap-3 p-3 ps-4 sm:p-4 sm:ps-5">
        <div className="flex min-w-0 flex-1 flex-col gap-3 @2xl:flex-row @2xl:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {message.imageUrl ? (
              // A remote, admin-chosen image; next/image would need its host listed. Decorative.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={message.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-surface object-cover" />
            ) : (
              <MessageIcon view={view} className="h-10 w-10 rounded-xl bg-surface [&>svg]:h-5 [&>svg]:w-5" />
            )}
            <div className="min-w-0 text-start">
              <p className="line-clamp-2 font-display text-[15px] leading-5 font-bold text-text">{view.title}</p>
              {view.body ? <p className="mt-0.5 line-clamp-3 text-[13px] leading-[18px] text-muted">{view.body}</p> : null}
            </div>
          </div>
          {hasActions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 ps-13 @2xl:ps-0">
              {view.link ? (
                <MessageAction
                  kind="link"
                  action={{ type: "link", url: view.link.url }}
                  label={view.link.label}
                  trackId={`${TRACK}.link`}
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-text underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary pointer-coarse:min-h-11"
                  handlers={handlers}
                  newTabNote={newTabNote}
                />
              ) : null}
              {view.buttons.map((button) => (
                <MessageAction
                  key={`${button.kind}:${button.label}`}
                  kind={button.kind}
                  action={button.action}
                  label={button.label}
                  trackId={`${TRACK}.${button.kind}`}
                  className={messageButtonClass(button, tone, "sm")}
                  handlers={handlers}
                  newTabNote={newTabNote}
                />
              ))}
            </div>
          ) : null}
        </div>
        {view.dismissible ? (
          <IconButton
            label={view.closeLabel}
            icon={<X className="h-[18px] w-[18px]" />}
            tooltip={false}
            trackId={`${TRACK}.close`}
            onClick={handlers.onClose}
            className="-my-0.5 -me-1 hover:bg-surface"
          />
        ) : null}
      </div>
    </section>
  );
}
