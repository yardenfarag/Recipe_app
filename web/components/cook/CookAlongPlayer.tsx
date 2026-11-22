"use client";

import { ExternalLink, Info, Play, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";

import { formatVideoTimestamp } from "@shared/lib/formatVideoTimestamp";

import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { pageUrlAt, playerSrc, type CookAlongVideo } from "@/lib/cook/cookAlongVideo";
import { listeningMessage, playerOrigin, readPlayerMessage, seekMessages } from "@/lib/cook/playerMessages";
import type { SeekRequest } from "@/lib/cook/useCookAlong";

/** After this long without the iframe loading, offer the video's own site instead. */
const SLOW_LOAD_MS = 15_000;
const MIN_PANEL_PX = 120;
const RESIZE_STEP_PX = 40;

/**
 * The source video, playing beside the recipe.
 *
 * Below `xl` it is a panel that sticks to the top of the screen while the ingredients and steps scroll under it,
 * edge to edge on phones, with a handle at the bottom to drag it taller or shorter (or the arrow keys on the
 * handle). From `xl` it sits in a column at the end side, sticky as the recipe scrolls. The parent puts it in
 * the layout; this component owns its shape.
 *
 * Seeking: YouTube and TikTok take a seek message once their player says it is ready. YouTube asked before then
 * reloads at the new start time instead. Instagram and Facebook can't be told a time, so the panel says where to
 * skip to. "Watch on …" is always there, for when a video won't play embedded (removed, private, region-locked).
 */
export function CookAlongPlayer({
  id,
  video,
  request,
  hasStepTimes,
  onClose,
  onTime,
  className,
}: {
  id?: string;
  /** Placement in the parent's layout (grid column, margins). */
  className?: string;
  video: CookAlongVideo;
  /** Where to play from; a new id asks again. */
  request: SeekRequest;
  /** Whether any step has a time, to say "tap step times to jump". */
  hasStepTimes: boolean;
  onClose: () => void;
  /** The video's time, while it plays (YouTube and TikTok). */
  onTime?: (seconds: number) => void;
}) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [origin] = useState(() => (typeof window === "undefined" ? undefined : window.location.origin));

  // The iframe's start, and which request it was built for.
  const [load, setLoad] = useState({ requestId: request.id, start: request.seconds, attempt: 0 });
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [ready, setReady] = useState(false);
  // Instagram and Facebook: where the reader asked to go, said in words.
  const [skipTo, setSkipTo] = useState<number | null>(!video.canSeek && request.seconds > 0 ? request.seconds : null);
  const [seenRequest, setSeenRequest] = useState(request.id);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);

  // A new request, adjusted during render (not in an effect) so the iframe never shows the old start first.
  if (request.id !== seenRequest) {
    setSeenRequest(request.id);
    if (!video.canSeek) {
      setSkipTo(request.seconds > 0 ? request.seconds : null);
    } else if (video.platform === "youtube" && !ready) {
      setLoad((current) => ({ requestId: request.id, start: request.seconds, attempt: current.attempt + 1 }));
      setLoaded(false);
      setSlow(false);
    }
  }

  const src = playerSrc(video, { startSeconds: video.platform === "youtube" ? load.start : 0, origin });

  // Seek by message once the player is ready, for requests the iframe's URL didn't already start at.
  const applied = useRef<number | null>(null);
  useEffect(() => {
    if (!ready || !video.canSeek || applied.current === request.id) return;
    applied.current = request.id;
    const startedByUrl = request.id === load.requestId && (video.platform === "youtube" || request.seconds === 0);
    if (startedByUrl) return;
    const target = playerOrigin(video.platform);
    const frame = iframeRef.current?.contentWindow;
    if (!target || !frame) return;
    for (const message of seekMessages(video.platform, request.seconds)) frame.postMessage(message, target);
  }, [ready, request, load.requestId, video]);

  // Listen to the player: ready, and its time.
  const onTimeRef = useRef(onTime);
  useEffect(() => {
    onTimeRef.current = onTime;
  }, [onTime]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const parsed = readPlayerMessage(video.platform, event.origin, event.data);
      if (!parsed) return;
      setReady(true);
      if (parsed.kind === "time") onTimeRef.current?.(parsed.seconds);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [video.platform]);

  // YouTube's player only talks once told someone is listening; keep saying so until it answers.
  useEffect(() => {
    const hello = listeningMessage(video.platform);
    const target = playerOrigin(video.platform);
    if (!loaded || ready || !hello || !target) return;
    let tries = 0;
    const say = () => iframeRef.current?.contentWindow?.postMessage(hello, target);
    say();
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > 30) window.clearInterval(timer);
      else say();
    }, 400);
    return () => window.clearInterval(timer);
  }, [loaded, ready, video.platform, load.attempt]);

  // Cross-origin frames don't report failures, so a long silence is the only sign.
  useEffect(() => {
    if (loaded) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, load.attempt]);

  // Opened from a button high on the page: bring the panel into view if it landed far down.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof root.scrollIntoView !== "function") return;
    const top = root.getBoundingClientRect().top;
    if (top > window.innerHeight * 0.55) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      root.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, []);

  // Resizing the phone/tablet panel.
  const drag = useRef<{ pointer: number; startY: number; startHeight: number } | null>(null);
  const maxHeight = () => Math.round(window.innerHeight * 0.75);
  const clampHeight = (height: number) => Math.round(Math.min(maxHeight(), Math.max(MIN_PANEL_PX, height)));
  const currentHeight = () => frameRef.current?.getBoundingClientRect().height ?? 240;
  const onHandleDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointer: event.pointerId, startY: event.clientY, startHeight: currentHeight() };
  };
  const onHandleMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== event.pointerId) return;
    setPanelHeight(clampHeight(drag.current.startHeight + event.clientY - drag.current.startY));
  };
  const onHandleUp = () => {
    drag.current = null;
  };
  const onHandleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const by = { ArrowDown: RESIZE_STEP_PX, ArrowUp: -RESIZE_STEP_PX, PageDown: RESIZE_STEP_PX * 3, PageUp: -RESIZE_STEP_PX * 3 }[event.key];
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setPanelHeight(event.key === "Home" ? MIN_PANEL_PX : maxHeight());
    } else if (by) {
      event.preventDefault();
      setPanelHeight(clampHeight(currentHeight() + by));
    }
  };

  const openHere = pageUrlAt(video, skipTo ?? (load.requestId === request.id ? load.start : request.seconds));
  const watchOn = t("web.cook.watchOn", { platform: video.label });
  const portrait = video.shape === "portrait";
  const defaultHeight = portrait ? "min(46dvh, 30rem)" : "min(56.25vw, 42dvh)";

  return (
    <section
      ref={rootRef}
      id={id}
      aria-labelledby="cook-along-heading"
      data-testid="cook-along"
      className={cn(
        "z-20 scroll-mt-16 self-start",
        // Phones and tablets: a panel stuck to the top, under the phone's top bar. Edge to edge on phones.
        "sticky top-14 -mx-5 sm:-mx-8 md:top-3 md:mx-0",
        // Wide screens: the end column, in view while the recipe scrolls.
        "xl:top-6",
        className,
      )}
    >
      <div className="overflow-hidden border-b border-border bg-surface md:rounded-tile md:border">
        <div className="flex items-center gap-2 py-1.5 ps-4 pe-1.5 md:py-2 md:ps-5">
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary-text">
            <Play className="h-4 w-4 fill-current" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <h2 id="cook-along-heading" className="truncate text-sm font-bold text-text">
              {t("cookAlong.title")}
            </h2>
            <p className="truncate text-xs text-muted">
              {video.label}
              {hasStepTimes && video.canSeek ? ` · ${t("cookAlong.jumpHint")}` : null}
            </p>
          </div>
          <Tooltip label={watchOn}>
            <a
              href={openHere}
              target="_blank"
              rel="noopener noreferrer"
              data-track="cook_along.open_in_browser"
              aria-label={`${watchOn} (${t("web.recipe.opensInNewTab")})`}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-element hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
            >
              <ExternalLink aria-hidden className="h-[18px] w-[18px] rtl:-scale-x-100" />
            </a>
          </Tooltip>
          <IconButton label={t("cookAlong.close")} trackId="cook_along.close" icon={<X className="h-5 w-5" />} onClick={onClose} />
        </div>

        <div
          ref={frameRef}
          style={{ ["--panel-h" as string]: panelHeight != null ? `${panelHeight}px` : defaultHeight }}
          className={cn(
            "flex h-(--panel-h) justify-center bg-element",
            portrait ? "xl:h-[min(calc(100dvh-11rem),44rem)]" : "xl:h-auto",
          )}
        >
          <div className={cn("relative h-full max-w-full", portrait ? "aspect-[9/16]" : "aspect-video xl:h-auto xl:w-full")}>
            {src ? (
              <iframe
                key={`${src}#${load.attempt}`}
                ref={iframeRef}
                src={src}
                title={t("cookAlong.iframeTitle")}
                data-testid="cook-along-frame"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => {
                  setLoaded(true);
                  setSlow(false);
                }}
                className="absolute inset-0 h-full w-full border-0"
              />
            ) : null}
            {src && !loaded && !slow ? (
              <div className="absolute inset-0 grid place-items-center bg-element">
                <Spinner label={t("a11y.loadingVideo")} />
              </div>
            ) : null}
            {!src || slow ? (
              <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-element p-5 text-center">
                <TriangleAlert aria-hidden className="h-7 w-7 text-warning" />
                <p className="max-w-xs text-sm leading-relaxed text-text">{t("cookAlong.loadFailed")}</p>
                <a
                  href={openHere}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-track="cook_along.load_error.open_in_browser"
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 font-display text-sm font-bold text-on-primary hover:brightness-105"
                >
                  {watchOn}
                  <span className="sr-only"> ({t("web.recipe.opensInNewTab")})</span>
                  <ExternalLink aria-hidden className="h-4 w-4 rtl:-scale-x-100" />
                </a>
              </div>
            ) : null}
          </div>
        </div>

        {skipTo != null ? (
          <div role="status" className="flex items-start gap-2 border-t border-border bg-accent-soft px-4 py-2.5 text-sm text-text">
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
            <p className="min-w-0 flex-1 leading-snug">
              {t("web.cook.noSeek", { platform: video.label, time: formatVideoTimestamp(skipTo) })}
            </p>
            <button
              type="button"
              data-track="cook_along.no_seek_notice.dismiss"
              onClick={() => setSkipTo(null)}
              aria-label={t("common.close")}
              className="-my-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-element hover:text-text"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t("web.cook.resize")}
          aria-valuemin={MIN_PANEL_PX}
          aria-valuenow={panelHeight ?? undefined}
          tabIndex={0}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onKeyDown={onHandleKey}
          className="flex h-6 cursor-row-resize touch-none items-center justify-center bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary xl:hidden"
        >
          <span aria-hidden className="h-1.5 w-12 rounded-full bg-border" />
        </div>
      </div>
    </section>
  );
}
