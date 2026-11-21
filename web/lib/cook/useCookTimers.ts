"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { playChime, primeChime } from "@/lib/cook/chime";

export type CookTimer = {
  id: string;
  /** As written in the step: "10 min". */
  label: string;
  /** The step it was started from. */
  step: number;
  seconds: number;
  endsAt: number;
};

/** Whole seconds left, never below zero. Counted from the end time, so a throttled background tab stays right. */
export function secondsLeft(timer: Pick<CookTimer, "endsAt">, now: number): number {
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

/**
 * Kitchen timers for cook mode. They belong to the cooking, not to a step: "simmer 20 min" keeps counting while
 * you read the next step, and while cook mode is closed. When one runs out it chimes and `onDone` is called once.
 */
export function useCookTimers({ onDone }: { onDone?: (timer: CookTimer) => void } = {}) {
  const [timers, setTimers] = useState<CookTimer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const announced = useRef(new Set<string>());
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const running = timers.some((timer) => secondsLeft(timer, now) > 0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    for (const timer of timers) {
      if (announced.current.has(timer.id) || secondsLeft(timer, now) > 0) continue;
      announced.current.add(timer.id);
      playChime();
      onDoneRef.current?.(timer);
    }
  }, [timers, now]);

  const start = useCallback((label: string, seconds: number, step: number) => {
    // Starting the sound from the tap lets it play later; browsers block audio that no gesture started.
    primeChime();
    const startedAt = Date.now();
    setNow(startedAt);
    setTimers((current) => [
      // The same timer again restarts it rather than adding a second one.
      ...current.filter((timer) => !(timer.label === label && timer.step === step)),
      { id: `${step}-${label}-${startedAt}`, label, step, seconds, endsAt: startedAt + seconds * 1000 },
    ]);
  }, []);

  const stop = useCallback((id: string) => {
    setTimers((current) => current.filter((timer) => timer.id !== id));
  }, []);

  return { timers, now, start, stop };
}
