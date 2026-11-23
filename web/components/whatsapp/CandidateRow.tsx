"use client";

import { Check, CircleAlert, Clock, Globe, Image as ImageIcon, LoaderCircle, Pin, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { ChatExport, ImportItemState, LinkPlatform, RecipeCandidate } from "@shared/lib/whatsappImport";

import { cn } from "@/lib/cn";

/** "12 May 2024" in the app's language; null when the chat line's date didn't parse. */
export function formatSentAt(sentAt: string | null, language: string): string | null {
  if (!sentAt) return null;
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * A photo from the chat as an object URL, read from the .zip only once its row is near the screen (a chat can hold
 * hundreds), and let go when the row goes.
 */
function useChatPhotoUrl(chat: Pick<ChatExport, "readPhoto">, photo: RecipeCandidate["photo"]) {
  const holder = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const fileName = photo?.fileName;
  const mime = photo?.mime;

  useEffect(() => {
    if (!fileName) return;
    let objectUrl: string | null = null;
    let done = false;
    const load = () => {
      if (done) return;
      done = true;
      try {
        const bytes = chat.readPhoto(fileName);
        if (!bytes) return;
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
        setUrl(objectUrl);
      } catch {
        // The icon stays.
      }
    };
    const node = holder.current;
    let observer: IntersectionObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (node && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            load();
          }
        },
        { rootMargin: "600px 0px" },
      );
      observer.observe(node);
    } else {
      timer = setTimeout(load, 0);
    }
    return () => {
      done = true;
      observer?.disconnect();
      if (timer) clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [chat, fileName, mime]);

  return { holder, url };
}

function PlatformIcon({ platform }: { platform?: LinkPlatform }) {
  const Icon = platform === "web" || !platform ? Globe : platform === "pinterest" ? Pin : Play;
  return <Icon className="h-5 w-5" />;
}

/** The picture at the start of a row: the photo itself, the link's kind of site, or the start of the written recipe. */
export function CandidateThumb({ candidate, chat, className }: { candidate: RecipeCandidate; chat: Pick<ChatExport, "readPhoto">; className?: string }) {
  const { holder, url } = useChatPhotoUrl(chat, candidate.kind === "photo" ? candidate.photo : undefined);
  const [failed, setFailed] = useState(false);
  const box = cn("grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl", className);

  if (candidate.kind === "photo") {
    return (
      <span ref={holder} aria-hidden className={cn(box, "bg-element text-muted")}>
        {url && !failed ? (
          // A local object URL: nothing for next/image to do.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-5 w-5" />
        )}
      </span>
    );
  }
  if (candidate.kind === "link") {
    return (
      // On the surface colour with a hairline: a ticked row is filled with the element colour, which primary-soft
      // matches in most packs.
      <span aria-hidden className={cn(box, "border border-border bg-surface text-primary-text")}>
        <PlatformIcon platform={candidate.platform} />
      </span>
    );
  }
  // A written recipe: its first words, like a note card. Decorative; the row says it in full.
  return (
    <span aria-hidden className={cn(box, "place-items-start bg-accent-soft p-1.5 text-start")}>
      <span className="line-clamp-4 text-[8px] leading-[10px] break-words text-accent-text">{candidate.text ?? candidate.preview}</span>
    </span>
  );
}

/** The text under the preview line: a caption, or a written recipe after its first line. Null when it adds nothing. */
function restOfText({ text, preview }: RecipeCandidate): string | null {
  const flat = (value: string) => value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const whole = flat(text);
  const first = flat(preview);
  const rest = first && whole.startsWith(first) ? whole.slice(first.length).trim() : whole;
  return rest && rest !== first ? rest : null;
}

/** What the row says: the preview line, the caption or the rest of a written recipe, and who sent it when. */
export function CandidateText({ candidate, aside }: { candidate: RecipeCandidate; aside?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const date = formatSentAt(candidate.sentAt, i18n.language);
  // Each part isolated (FSI … PDI), so a Latin name before a Hebrew date (or the reverse) keeps its own order.
  const isolate = (value: string) => `⁨${value}⁩`;
  const sentBy = date ? t("whatsappImport.sentBy", { sender: isolate(candidate.sender), date: isolate(date) }) : candidate.sender;
  const extra = restOfText(candidate);
  return (
    <span className="min-w-0 flex-1">
      <span className="line-clamp-2 text-[15px] leading-snug font-semibold break-words text-text" dir="auto">
        {candidate.preview}
      </span>
      {extra ? (
        <span className="mt-0.5 line-clamp-1 text-[13px] break-words text-muted" dir="auto">
          {extra}
        </span>
      ) : null}
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
        {/* In the page's direction: the date is in the app's language, whatever the sender's name is in. */}
        <span className="min-w-0 truncate">
          {sentBy}
        </span>
        {aside}
      </span>
    </span>
  );
}

/** The kind of item, as a word: Link, Written recipe, Photo. */
export function kindLabelKey(kind: RecipeCandidate["kind"]) {
  return kind === "link" ? "whatsappImport.kindLink" : kind === "text" ? "whatsappImport.kindText" : "whatsappImport.kindPhoto";
}

/** One row of the review list: a tick box. Already in the Library: shown, but can't be ticked. */
export function SelectableCandidateRow({
  candidate,
  chat,
  selected,
  onToggle,
}: {
  candidate: RecipeCandidate;
  chat: Pick<ChatExport, "readPhoto">;
  selected: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const disabled = candidate.alreadySaved;
  return (
    <li className="[contain-intrinsic-size:auto_84px] [content-visibility:auto]">
      <button
        type="button"
        role="checkbox"
        aria-checked={disabled ? false : selected}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        data-track="whatsapp_import.item.toggle"
        onClick={onToggle}
        className={cn(
          "flex min-h-[84px] w-full items-center gap-3 rounded-2xl p-2.5 text-start transition-colors focus-visible:-outline-offset-2",
          // Most rows start ticked, so a ticked row isn't filled: the tick box says it.
          disabled ? "cursor-default" : "hover:bg-element active:bg-selected",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors",
            disabled ? "border-border bg-element" : selected ? "border-primary bg-primary text-on-primary" : "border-muted/60 bg-surface",
          )}
        >
          {selected && !disabled ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        </span>
        <CandidateThumb candidate={candidate} chat={chat} className={disabled ? "opacity-60" : undefined} />
        <CandidateText
          candidate={candidate}
          aside={
            disabled ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-1.5 py-0.5 text-xs font-semibold text-success">
                <Check aria-hidden className="h-3 w-3" strokeWidth={3} />
                {t("whatsappImport.alreadySaved")}
              </span>
            ) : null
          }
        />
      </button>
    </li>
  );
}

const STATE_LOOK: Record<ImportItemState, { key: string; className: string; icon: ReactNode }> = {
  waiting: { key: "whatsappImport.itemWaiting", className: "text-muted", icon: <Clock aria-hidden className="h-4 w-4" /> },
  working: {
    key: "whatsappImport.itemWorking",
    className: "text-primary-text",
    icon: <LoaderCircle aria-hidden className="h-4 w-4 motion-safe:animate-spin" />,
  },
  saved: { key: "whatsappImport.itemSaved", className: "text-success", icon: <Check aria-hidden className="h-4 w-4" strokeWidth={3} /> },
  already_saved: {
    key: "whatsappImport.itemAlreadySaved",
    className: "text-success",
    icon: <Check aria-hidden className="h-4 w-4" strokeWidth={3} />,
  },
  failed: { key: "whatsappImport.itemFailed", className: "text-danger", icon: <CircleAlert aria-hidden className="h-4 w-4" /> },
  // Never started: the credits ran out first. It is still on the list.
  out_of_credits: { key: "whatsappImport.itemWaiting", className: "text-muted", icon: <Clock aria-hidden className="h-4 w-4" /> },
};

/** One row while importing and after: what happened to it, and a way to open it once it is in the Library. */
export function ImportStatusRow({
  candidate,
  chat,
  state,
  recipeId,
  finished = false,
}: {
  candidate: RecipeCandidate;
  chat: Pick<ChatExport, "readPhoto">;
  state: ImportItemState;
  recipeId?: string;
  /** The import is over: an item that never ran says nothing (it is still on the list), rather than "Waiting". */
  finished?: boolean;
}) {
  const { t } = useTranslation();
  const look = STATE_LOOK[state];
  const neverRan = finished && (state === "waiting" || state === "out_of_credits");
  const label = (
    <>
      {look.icon}
      {t(look.key)}
    </>
  );
  return (
    <li data-state={state} className="flex min-h-[84px] items-center gap-3 rounded-2xl p-2.5 [contain-intrinsic-size:auto_84px] [content-visibility:auto]">
      <CandidateThumb candidate={candidate} chat={chat} />
      <CandidateText candidate={candidate} />
      {recipeId && (state === "saved" || state === "already_saved") ? (
        <Link
          href={`/recipe/${recipeId}`}
          data-track="whatsapp_import.item.open"
          className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold hover:bg-element hover:underline", look.className)}
        >
          {label}
        </Link>
      ) : neverRan ? null : (
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 px-2 text-sm font-semibold", look.className)}>{label}</span>
      )}
    </li>
  );
}
