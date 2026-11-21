"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { createElement, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { storeUrlFor } from "@shared/lib/appStoreLinks";
import { isSafeRoute, isSafeWebUrl, type ButtonAction, type ClickedButton } from "@shared/lib/inAppMessages";
import type { MessageView, ViewButton } from "@shared/lib/inAppMessageView";

import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

import { messageIcon, TONE_CLASSES, type ToneClasses } from "./tone";

/** What a message's controls report. The control itself opens the page, the app screen or the store. */
export type MessageHandlers = {
  /** A button or the link that leads somewhere was used. */
  onPress: (kind: ClickedButton) => void;
  /** Closed without acting: a "dismiss" button or the close control. */
  onClose: () => void;
};

/** "/(tabs)/hub" (a mobile route an admin may have written) is "/hub" here; "/(tabs)" is the library. */
export function webRoute(href: string): string {
  const path = href
    .split("/")
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .join("/");
  return path.startsWith("/") ? path : `/${path}`;
}

function openStore() {
  window.open(storeUrlFor("web", navigator.userAgent ?? ""), "_blank", "noopener");
}

/**
 * One button or the link. A web address is a real link that opens a new tab, an app screen a real Next link, so
 * both work with a middle click and a screen reader says what they are. The store opens in a new tab straight from
 * the click (a browser blocks a tab opened after an await). An unsafe address does nothing but count the press.
 */
export function MessageAction({
  kind,
  action,
  label,
  className,
  trackId,
  handlers,
  newTabNote,
}: {
  kind: ClickedButton;
  action: ButtonAction;
  label: ReactNode;
  className: string;
  trackId: string;
  handlers: MessageHandlers;
  newTabNote: string;
}) {
  if (action.type === "link" && isSafeWebUrl(action.url)) {
    return (
      <a
        href={action.url}
        target="_blank"
        rel="noopener noreferrer"
        data-track={trackId}
        onClick={() => handlers.onPress(kind)}
        className={className}
      >
        {label}
        <span className="sr-only"> ({newTabNote})</span>
        <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0 rtl:-scale-x-100" />
      </a>
    );
  }
  if (action.type === "route" && isSafeRoute(action.href)) {
    return (
      <Link href={webRoute(action.href)} data-track={trackId} onClick={() => handlers.onPress(kind)} className={className}>
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      data-track={trackId}
      onClick={() => {
        if (action.type === "dismiss") {
          handlers.onClose();
          return;
        }
        if (action.type === "store") openStore();
        handlers.onPress(kind);
      }}
      className={className}
    >
      {label}
    </button>
  );
}

export function messageButtonClass(button: Pick<ViewButton, "style">, tone: ToneClasses, size: "sm" | "md" = "md") {
  return button.style === "primary"
    ? buttonClasses({ variant: "primary", size, className: cn(tone.fill, "whitespace-normal text-center") })
    : buttonClasses({ variant: "outline", size, className: "whitespace-normal text-center" });
}

/** The tone's icon (or the admin's) in its soft badge. Decorative: the title says it all. */
export function MessageIcon({ view, className }: { view: MessageView; className?: string }) {
  const tone = TONE_CLASSES[view.message.tone];
  // A lookup in a fixed map, not a component made here.
  const icon = createElement(messageIcon(view.message.icon, view.message.tone), { className: cn("h-6 w-6", tone.text) });
  return (
    <span aria-hidden className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", tone.soft, className)}>
      {icon}
    </span>
  );
}

/**
 * Icon, image, title, body, buttons and link: the inside of the alert card, the sheet and the full-screen page.
 * `wrapTitle` / `wrapBody` let a dialog mark them as its title and description.
 */
export function MessageBody({
  view,
  trackPrefix,
  handlers,
  align = "start",
  closeButton = false,
  wrapTitle = (node) => node,
  wrapBody = (node) => node,
}: {
  view: MessageView;
  /** "in_app_message.alert": buttons log `.primary`, `.secondary`, `.link`, `.close_button` (the mobile ids). */
  trackPrefix: string;
  handlers: MessageHandlers;
  align?: "start" | "center";
  /** A last, quiet button that closes the message (an alert whose buttons all lead somewhere). */
  closeButton?: boolean;
  wrapTitle?: (node: ReactElement) => ReactNode;
  wrapBody?: (node: ReactElement) => ReactNode;
}) {
  const { t } = useTranslation();
  const { message } = view;
  const tone = TONE_CLASSES[message.tone];
  const centered = align === "center";
  const newTabNote = t("web.recipe.opensInNewTab");

  return (
    <div className={cn("w-full", centered ? "text-center" : "text-start")}>
      {message.imageUrl ? (
        // A remote, admin-chosen image of any size; next/image would need its host listed. Decorative.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={message.imageUrl} alt="" className={cn("mb-4 aspect-video w-full rounded-2xl object-cover", tone.soft)} />
      ) : null}
      <MessageIcon view={view} className={centered ? "mx-auto" : undefined} />
      {wrapTitle(<h2 className="mt-3 text-xl font-bold text-text">{view.title}</h2>)}
      {view.body ? wrapBody(<p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-muted">{view.body}</p>) : null}
      {view.buttons.length > 0 || closeButton ? (
        <div className="mt-5 flex flex-col gap-2">
          {view.buttons.map((button) => (
            <MessageAction
              key={`${button.kind}:${button.label}`}
              kind={button.kind}
              action={button.action}
              label={button.label}
              trackId={`${trackPrefix}.${button.kind}`}
              className={messageButtonClass(button, tone)}
              handlers={handlers}
              newTabNote={newTabNote}
            />
          ))}
          {closeButton ? (
            <button
              type="button"
              data-track={`${trackPrefix}.close_button`}
              onClick={handlers.onClose}
              className={buttonClasses({ variant: "ghost", className: "text-muted" })}
            >
              {view.closeLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      {view.link ? (
        <div className={cn("mt-3", centered && "flex justify-center")}>
          <MessageAction
            kind="link"
            action={{ type: "link", url: view.link.url }}
            label={view.link.label}
            trackId={`${trackPrefix}.link`}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-lg text-[15px] font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary",
              message.tone === "info" ? "text-primary" : "text-text",
            )}
            handlers={handlers}
            newTabNote={newTabNote}
          />
        </div>
      ) : null}
    </div>
  );
}
