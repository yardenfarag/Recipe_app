"use client";

import { ImagePlus, Link2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { normalizeSocialUrl } from "@shared/lib/platformUrls";

import { cn } from "@/lib/cn";
import { handToSnap } from "@/lib/snap/handoff";

/** "⌘K" on a Mac, "Ctrl K" elsewhere. Read in the browser, so it is empty until the page has loaded. */
export function useShortcutKeys(): string {
  const [keys, setKeys] = useState("");
  useEffect(() => {
    // The platform is only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKeys(/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K");
  }, []);
  return keys;
}

const isSnapFile = (file: File) => file.type.startsWith("image/") || file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/**
 * The Snap bar (PIN-160): one wide field that takes whatever you have. A link starts an import, a photo or PDF
 * (pasted, dropped or picked) does too, and anything else searches your recipes. Imports are handed to the Snap
 * page, so they run exactly as they do there.
 *
 * `liveSearch` is for a page that filters its own list as you type (the Library): it reads the text through
 * `value`/`onChange`, and Enter then has nothing more to do. Without it, Enter opens the Library with the search.
 */
export function SnapBarField({
  value,
  onChange,
  liveSearch = false,
  onDone,
  inputRef,
  size = "lg",
  autoFocus = false,
  className,
}: {
  /** The text in the field, when the page holds it (the Library keeps it in the address). */
  value?: string;
  onChange?: (value: string) => void;
  liveSearch?: boolean;
  /** Called after the bar sent you somewhere (closes the ⌘K dialog). */
  onDone?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  size?: "md" | "lg";
  autoFocus?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const keys = useShortcutKeys();
  const [own, setOwn] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const text = value ?? own;
  const link = normalizeSocialUrl(text);
  const lg = size === "lg";

  const setText = (next: string) => {
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };

  const snapLink = (url: string) => {
    handToSnap({ url });
    setText("");
    onDone?.();
    router.push("/add");
  };

  const snapFile = (file: File) => {
    handToSnap({ file });
    onDone?.();
    router.push("/add");
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (link) {
      snapLink(link);
      return;
    }
    const query = text.trim();
    if (!query) {
      // Nothing typed: the button is the way into Snap.
      onDone?.();
      router.push("/add");
      return;
    }
    if (liveSearch) return;
    onDone?.();
    router.push(`/?q=${encodeURIComponent(query)}`);
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const file = Array.from(event.clipboardData.files).find(isSnapFile);
    if (!file) return;
    event.preventDefault();
    snapFile(file);
  }

  const dragHasFile = (event: DragEvent) => event.dataTransfer.types.includes("Files");
  function onDrop(event: DragEvent<HTMLFormElement>) {
    setDragging(false);
    const file = Array.from(event.dataTransfer.files).find(isSnapFile);
    if (file) {
      event.preventDefault();
      snapFile(file);
      return;
    }
    const dropped = normalizeSocialUrl(event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain"));
    if (dropped) {
      event.preventDefault();
      snapLink(dropped);
    }
  }

  const Leading = link || !text.trim() ? Link2 : Search;

  return (
    <form
      role="search"
      onSubmit={submit}
      onDragOver={(event) => {
        if (!dragHasFile(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      data-testid="snap-bar"
      className={cn(
        "flex min-w-0 items-center border bg-surface text-muted transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15",
        lg ? "min-h-15 gap-3 rounded-[20px] ps-5 pe-2" : "min-h-13 gap-2.5 rounded-2xl ps-4 pe-1.5",
        dragging ? "border-primary ring-4 ring-primary/15" : "border-border",
        className,
      )}
    >
      <Leading aria-hidden className="h-5 w-5 shrink-0" />
      <input
        ref={inputRef}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onPaste={onPaste}
        onKeyDown={(event) => {
          if (event.key === "Escape" && text) {
            event.preventDefault();
            event.stopPropagation();
            setText("");
          }
        }}
        placeholder={t(lg ? "web.snapBar.placeholder" : "web.snapBar.placeholderShort")}
        aria-label={t("web.snapBar.label")}
        aria-keyshortcuts="Control+K Meta+K /"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint={link ? "go" : "search"}
        autoFocus={autoFocus}
        className={cn(
          "h-11 min-w-0 flex-1 bg-transparent font-medium text-text placeholder:text-muted [&::-webkit-search-cancel-button]:hidden",
          lg ? "text-base" : "text-[15px]",
        )}
      />
      {text ? (
        <button
          type="button"
          aria-label={t("library.clearSearch")}
          data-track="snap_bar.clear"
          onClick={() => setText("")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-element hover:text-text"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      ) : (
        <>
          {keys ? (
            <kbd
              aria-hidden
              className="hidden shrink-0 rounded-lg border border-border px-2 py-1 font-sans text-[13px] font-medium text-muted [@media(hover:hover)]:block"
            >
              {keys}
            </kbd>
          ) : null}
          <button
            type="button"
            aria-label={t("web.snapBar.addPhoto")}
            title={t("web.snapBar.addPhoto")}
            data-track="snap_bar.add_photo"
            onClick={() => fileInput.current?.click()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-element hover:text-text"
          >
            <ImagePlus aria-hidden className="h-5 w-5" />
          </button>
        </>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*,application/pdf"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) snapFile(file);
        }}
      />
      <button
        type="submit"
        data-track={link ? "snap_bar.snap_link" : "snap_bar.submit"}
        className={cn(
          "shrink-0 bg-primary font-display font-bold text-on-primary transition-[filter] hover:brightness-105 active:brightness-95",
          lg ? "h-11 rounded-btn px-5 text-[15px]" : "h-10 rounded-xl px-3.5 text-sm",
        )}
      >
        {lg ? t("web.snapBar.action") : t("tabs.snap")}
      </button>
    </form>
  );
}
