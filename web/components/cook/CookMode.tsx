"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { useDirection } from "@radix-ui/react-direction";
import { ArrowLeft, ArrowRight, Check, Maximize, Minimize, RotateCcw, Sun, Timer, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";

import { stepSpeech, voiceAvailability } from "@shared/lib/readAloud";
import { formatCountdown, parseStepTimers } from "@shared/lib/stepTimers";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";
import { cookModeMove, swipeMove } from "@/lib/cook/cookModeKeys";
import { secondsLeft, type CookTimer } from "@/lib/cook/useCookTimers";
import { useFullscreen } from "@/lib/cook/useFullscreen";
import { useReadAloud, useReadAloudPreference } from "@/lib/cook/useReadAloud";
import { useWakeLock } from "@/lib/cook/useWakeLock";

export type CookModeStep = { step: number; text: string };

export type CookModeTimers = {
  timers: CookTimer[];
  now: number;
  start: (label: string, seconds: number, step: number) => void;
  stop: (id: string) => void;
};

/**
 * One step at a time, large enough to read from across the counter. Back and Next are big targets at the bottom;
 * the arrow keys, Space and Page Up/Down (a presentation clicker) move too, and a swipe on touch screens. The
 * screen stays awake while it is open, where the browser allows, and a laptop can go full screen.
 *
 * Times in a step ("simmer 10 min") become timers. They keep running across steps and after closing (the page
 * holds them, see useCookTimers), and chime when done.
 *
 * The step's position is held by the page, so closing by mistake and reopening comes back to the same step.
 *
 * The speaker button reads each step aloud as it appears, in the recipe's language (see useReadAloud). It is
 * greyed out, with a tooltip saying why, when the browser has no voice for that language.
 */
export function CookMode({
  open,
  onOpenChange,
  title,
  steps,
  direction,
  contentLanguage,
  index,
  onIndexChange,
  timers,
  onCooked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The steps as shown on the page (amounts in the chosen system). */
  steps: CookModeStep[];
  /** The recipe text's direction and language, which can differ from the app's. */
  direction: "ltr" | "rtl";
  contentLanguage?: string | null;
  /** 0…steps.length; steps.length is the "That's it" screen. */
  index: number;
  onIndexChange: (index: number) => void;
  timers: CookModeTimers;
  /** "I cooked this" on the last screen. Left out where the recipe isn't saved. */
  onCooked?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const appDirection = useDirection() === "rtl" ? "rtl" : "ltr";
  const wakeLock = useWakeLock(open);
  const fullscreen = useFullscreen();
  const swipe = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const total = steps.length;
  const position = Math.min(Math.max(0, index), total);
  const done = total > 0 && position >= total;
  const step = done ? null : steps[position];
  const stepTimers = useMemo(() => (step ? parseStepTimers(step.text) : []), [step]);
  const isLast = position === total - 1;

  const go = (next: number) => onIndexChange(Math.min(Math.max(0, next), total));
  const goNext = () => go(position + 1);
  const goBack = () => go(position - 1);

  const close = (next: boolean) => {
    if (!next) fullscreen.exit();
    onOpenChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const onControl = Boolean(target.closest("button, a, input, textarea, select, [role='separator']"));
    const move = cookModeMove(event, { direction: appDirection, onControl });
    if (!move) return;
    event.preventDefault();
    if (move === "next") goNext();
    else if (move === "back") goBack();
    else if (move === "first") go(0);
    else go(Math.max(0, total - 1));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    swipe.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.pointer !== event.pointerId) return;
    const move = swipeMove(event.clientX - start.x, event.clientY - start.y, appDirection);
    if (move === "next") goNext();
    else if (move === "back") goBack();
  };

  const stepLabel = t("recipe.cookModeStep", { current: position + 1, total });
  const doneTimers = timers.timers.filter((timer) => secondsLeft(timer, timers.now) === 0);

  // Read aloud: the step as shown (translated, amounts converted), in the recipe's language.
  const readAloud = useReadAloud(open);
  const { queue } = readAloud;
  const [readAloudOn, setReadAloudOn] = useReadAloudPreference();
  const appLanguage = i18n.language;
  const speechLanguage = contentLanguage ?? appLanguage;
  const stepVoice = voiceAvailability(readAloud.voices, speechLanguage);
  const appVoice = voiceAvailability(readAloud.voices, appLanguage);
  const voiceMissing = stepVoice.status === "missing";
  const reading = open && readAloudOn && readAloud.supported && !voiceMissing;
  const speech = done
    ? appVoice.status === "missing"
      ? null
      : { text: t("recipe.cookModeDone"), language: appLanguage, voice: appVoice.status === "ready" ? appVoice.voice : null }
    : step
      ? {
          text: stepSpeech({ text: step.text, label: stepLabel, textLanguage: speechLanguage, labelLanguage: appLanguage }),
          language: speechLanguage,
          voice: stepVoice.status === "ready" ? stepVoice.voice : null,
        }
      : null;
  const readCurrent = () => {
    if (speech) queue.say(speech.text, speech.language, speech.voice);
  };
  const speechText = speech?.text;
  const speechLang = speech?.language;
  const speechVoiceId = speech?.voice?.id;
  const speechVoiceLang = speech?.voice?.language;
  useEffect(() => {
    if (!reading) {
      queue.stop();
      return;
    }
    // A new step, or turning the speaker on, reads it. The voice list arriving late reads it again in the right voice.
    if (!speechText || !speechLang) return;
    queue.say(speechText, speechLang, speechVoiceId && speechVoiceLang ? { id: speechVoiceId, language: speechVoiceLang } : null);
  }, [reading, speechText, speechLang, speechVoiceId, speechVoiceLang, queue]);

  // A finished timer is read after the current step, not over it. The chime plays as well (useCookTimers).
  const doneTimerIds = doneTimers.map((timer) => timer.id).join(" ");
  const spokenTimers = useRef(new Set<string>());
  const appVoiceStatus = appVoice.status;
  const appVoiceId = appVoice.status === "ready" ? appVoice.voice.id : undefined;
  const appVoiceLang = appVoice.status === "ready" ? appVoice.voice.language : undefined;
  useEffect(() => {
    const fresh = doneTimerIds.split(" ").filter((id) => id && !spokenTimers.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) spokenTimers.current.add(id);
    if (!reading || appVoiceStatus === "missing") return;
    queue.append(t("recipe.cookModeTimerDone"), appLanguage, appVoiceId && appVoiceLang ? { id: appVoiceId, language: appVoiceLang } : null);
  }, [doneTimerIds, reading, appVoiceStatus, appVoiceId, appVoiceLang, appLanguage, queue, t]);

  const languageName = t(`languages.${speechLanguage.split("-")[0]}`, { defaultValue: speechLanguage });
  const speakerLabel = voiceMissing ? t("recipe.cookModeNoVoice", { language: languageName }) : t("recipe.cookModeReadAloud");

  return (
    <RadixDialog.Root open={open} onOpenChange={close}>
      <RadixDialog.Portal>
        <RadixDialog.Content
          ref={contentRef}
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          // Focus the whole view, not the close button: the keys work at once, and no tooltip pops up on opening.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus();
          }}
          tabIndex={-1}
          data-testid="cook-mode"
          className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-bg text-text outline-none"
        >
          <header className="flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-5">
            <RadixDialog.Close asChild>
              <IconButton label={t("recipe.cookModeClose")} trackId="cook_mode.close" icon={<X className="h-6 w-6" />} className="h-12 w-12" />
            </RadixDialog.Close>
            <RadixDialog.Title
              dir={direction}
              lang={contentLanguage ?? undefined}
              className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-muted sm:text-base"
            >
              {title}
            </RadixDialog.Title>
            {wakeLock === "on" ? (
              <span className="hidden items-center gap-1.5 rounded-lg bg-success-soft px-3 py-1.5 text-xs font-semibold text-success sm:inline-flex">
                <Sun aria-hidden className="h-3.5 w-3.5" />
                {t("web.cook.screenOn")}
              </span>
            ) : null}
            {readAloud.supported ? (
              <IconButton
                label={speakerLabel}
                aria-pressed={voiceMissing ? undefined : reading}
                aria-disabled={voiceMissing || undefined}
                trackId="cook_mode.read_aloud.toggle"
                icon={reading ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                // Not `disabled`: a disabled button gets no hover or focus, so its tooltip could never say why.
                onClick={voiceMissing ? undefined : () => setReadAloudOn(!readAloudOn)}
                className={cn(
                  "h-12 w-12",
                  reading && "bg-primary-soft text-primary-text hover:bg-primary-soft hover:text-primary-text",
                  voiceMissing && "opacity-50 hover:bg-transparent hover:text-muted",
                )}
              />
            ) : null}
            {fullscreen.supported ? (
              <IconButton
                label={fullscreen.active ? t("web.cook.exitFullScreen") : t("web.cook.fullScreen")}
                aria-pressed={fullscreen.active}
                trackId="cook_mode.fullscreen.toggle"
                icon={fullscreen.active ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                onClick={fullscreen.toggle}
                className="h-12 w-12"
              />
            ) : (
              // Keeps the title centred.
              <span aria-hidden className="h-12 w-12" />
            )}
          </header>

          {total > 1 ? (
            <nav aria-label={t("web.cook.progress")} className="mx-auto mt-2 w-full max-w-5xl px-5 sm:px-8">
              <ol className="flex gap-1.5">
                {steps.map((item, itemIndex) => (
                  <li key={`${item.step}-${itemIndex}`} className="flex-1">
                    <button
                      type="button"
                      data-track="cook_mode.progress.go_to_step"
                      onClick={() => go(itemIndex)}
                      aria-label={t("web.cook.goToStep", { step: itemIndex + 1 })}
                      aria-current={itemIndex === position ? "step" : undefined}
                      className="group block w-full py-2"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "block h-1.5 rounded-full transition-colors group-hover:brightness-95",
                          itemIndex <= position || done ? "bg-primary" : "bg-element",
                          itemIndex === position && !done && "ring-2 ring-primary-soft",
                        )}
                      />
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          <div
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (swipe.current = null)}
          >
            <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-6 py-8 sm:px-10 lg:px-14">
              {done || total === 0 ? (
                <div className="flex flex-col items-center text-center">
                  <span aria-hidden className="grid h-20 w-20 place-items-center rounded-full bg-success-soft text-success">
                    <Check className="h-10 w-10" strokeWidth={2.5} />
                  </span>
                  <h2 className="mt-6 text-4xl font-bold tracking-tight text-balance sm:text-5xl">{t("recipe.cookModeDone")}</h2>
                  <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
                    {onCooked ? (
                      <Button
                        size="lg"
                        className="h-14 text-lg"
                        trackId="cook_mode.mark_cooked"
                        onClick={() => {
                          onCooked();
                          close(false);
                        }}
                      >
                        {t("recipe.cookedAction")}
                      </Button>
                    ) : null}
                    {total > 0 ? (
                      <Button variant="ghost" trackId="cook_mode.start_over" onClick={() => go(0)}>
                        <RotateCcw aria-hidden className="h-4 w-4" />
                        {t("web.cook.startOver")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
                    <p className="font-display text-sm font-bold tracking-[0.08em] text-primary-text uppercase rtl:tracking-normal sm:text-base">{stepLabel}</p>
                    {reading ? (
                      <Button variant="ghost" size="sm" trackId="cook_mode.read_aloud.replay" onClick={readCurrent}>
                        <Volume2 aria-hidden className="h-4 w-4" />
                        {t("recipe.cookModeReadAgain")}
                      </Button>
                    ) : null}
                  </div>
                  <p
                    key={position}
                    dir={direction}
                    lang={contentLanguage ?? undefined}
                    data-testid="cook-mode-step"
                    className="mt-4 animate-fade-in text-start text-[clamp(1.625rem,1rem+2.4vw,3rem)] leading-[1.3] font-display font-bold tracking-[-0.015em] text-pretty rtl:tracking-normal"
                  >
                    {step?.text}
                  </p>
                  {stepTimers.length > 0 ? (
                    <ul className="mt-8 flex flex-wrap gap-2.5">
                      {stepTimers.map((timer) => (
                        <li key={`${timer.seconds}-${timer.label}`}>
                          <button
                            type="button"
                            data-track="cook_mode.timer.start"
                            onClick={() => timers.start(timer.label, timer.seconds, position + 1)}
                            aria-label={t("recipe.cookModeTimer", { label: timer.label })}
                            className="inline-flex h-14 items-center gap-2.5 rounded-2xl bg-primary-soft px-5 text-lg font-bold text-primary-text transition-[filter] hover:brightness-95 active:brightness-90"
                          >
                            <Timer aria-hidden className="h-5 w-5" />
                            <span dir={direction}>{timer.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* Read out the new step after Next or Back; the step's own text isn't a live region, so it isn't read twice.
              Quiet while the speaker reads it, or a screen reader user would hear it twice. */}
          <p aria-live="polite" className="sr-only">
            {reading ? "" : done ? t("recipe.cookModeDone") : step ? `${stepLabel}. ${step.text}` : ""}
          </p>
          <p aria-live="assertive" className="sr-only">
            {doneTimers.map((timer) => t("web.cook.timerDone", { label: timer.label })).join(". ")}
          </p>

          {timers.timers.length > 0 ? (
            <section aria-label={t("web.cook.timers")} className="mx-auto w-full max-w-5xl px-5 sm:px-8">
              <ul className="flex flex-wrap justify-center gap-2 pb-3">
                {timers.timers.map((timer) => {
                  const left = secondsLeft(timer, timers.now);
                  const finished = left === 0;
                  return (
                    <li
                      key={timer.id}
                      data-testid="cook-timer"
                      className={cn(
                        "inline-flex items-center gap-3 rounded-2xl py-2 ps-4 pe-2 text-sm font-semibold",
                        finished ? "bg-primary text-on-primary motion-safe:animate-pulse" : "bg-element text-text",
                      )}
                    >
                      <Timer aria-hidden className="h-5 w-5" />
                      <span role="timer" className="font-display text-[26px] leading-none font-bold tabular-nums" dir="ltr">
                        {finished ? t("recipe.cookModeTimerDone") : formatCountdown(left)}
                      </span>
                      <span className={cn("text-xs font-medium", finished ? "text-on-primary" : "text-muted")}>
                        <span dir={direction}>{timer.label}</span> · {t("web.cook.timerStep", { step: timer.step })}
                      </span>
                      <button
                        type="button"
                        data-track="cook_mode.timer.stop"
                        onClick={() => timers.stop(timer.id)}
                        aria-label={t("web.cook.stopTimer", { label: timer.label })}
                        className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface/40"
                      >
                        <X aria-hidden className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <footer className="border-t border-border bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6">
            <p className="mb-3 hidden text-center text-xs text-muted pointer-fine:block">{t("web.cook.keysHint")}</p>
            <p className="mb-3 hidden text-center text-xs text-muted pointer-coarse:block">{t("web.cook.swipeHint")}</p>
            <div className="mx-auto flex max-w-5xl gap-3">
              <Button
                variant="outline"
                size="lg"
                className="h-16 flex-1 text-lg"
                trackId="cook_mode.prev_step"
                onClick={goBack}
                disabled={position === 0 || total === 0}
              >
                <ArrowLeft aria-hidden className="h-5 w-5 rtl:rotate-180" />
                {t("recipe.cookModeBack")}
              </Button>
              {done || total === 0 ? (
                <Button size="lg" className="h-16 flex-[1.6] text-lg" trackId="cook_mode.finished.close" onClick={() => close(false)}>
                  {t("web.cook.backToRecipe")}
                </Button>
              ) : (
                <Button size="lg" className="h-16 flex-[1.6] text-lg" trackId="cook_mode.next_step" onClick={goNext}>
                  {isLast ? t("web.cook.finish") : t("recipe.cookModeNext")}
                  {isLast ? <Check aria-hidden className="h-5 w-5" /> : <ArrowRight aria-hidden className="h-5 w-5 rtl:rotate-180" />}
                </Button>
              )}
            </div>
          </footer>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
