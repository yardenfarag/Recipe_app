"use client";

import { useCallback, useRef, useState } from "react";

import { activeStepAt } from "@/lib/cook/playerMessages";
import type { Instruction } from "@shared/types/recipe";

/** "Play from this time": a new id each time, so tapping the same step twice seeks twice. */
export type SeekRequest = { id: number; seconds: number };

/**
 * The cook-along player's state on a recipe page: open or not, where it was last asked to play from, and which
 * step the video is on (when the player reports its time: YouTube and TikTok).
 */
export function useCookAlong(instructions: Instruction[]) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<SeekRequest>({ id: 0, seconds: 0 });
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const nextId = useRef(1);
  // Where the video was when last heard from, so closing and reopening the player carries on from there.
  const lastTime = useRef(0);

  const playAt = useCallback((seconds: number) => {
    setRequest({ id: nextId.current++, seconds: Math.max(0, Math.round(seconds)) });
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setActiveStep(null);
  }, []);

  const toggle = useCallback(() => {
    if (open) close();
    else playAt(lastTime.current);
  }, [open, close, playAt]);

  // Called several times a second while playing; only a change of step re-renders.
  const onTime = useCallback(
    (seconds: number) => {
      lastTime.current = seconds;
      setActiveStep(activeStepAt(instructions, seconds));
    },
    [instructions],
  );

  return { open, request, activeStep, playAt, toggle, close, onTime };
}
