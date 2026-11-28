"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { SNAP_REVEAL, ingredientRevealWindow } from "@shared/lib/snapReveal";

/**
 * The Snap reveal on the web (PIN-192): the first time a just-snapped recipe opens (`?justSaved=1`), it builds in
 * front of the cook. Title, then the cover, then the ingredients one by one, then the facts and steps, about 1.5 s
 * (`SNAP_REVEAL`, shared with the phone app). Plain CSS (`[data-snap-reveal]` in globals.css): the page root says
 * "playing", each piece says when it comes in. A click shows it all; `prefers-reduced-motion` shows it at once.
 * Then a small copy of the cover drops toward the Library link, and the "Saved · Remove" strip comes in.
 */

export type RevealPhase = "playing" | "flight" | "landed";

const RevealingContext = createContext(false);

export const SnapRevealProvider = RevealingContext.Provider;

/** Whether the page is building itself right now. */
export function useRevealing() {
  return useContext(RevealingContext);
}

type RevealAttributes = { "data-reveal"?: ""; style?: CSSProperties };

/**
 * The attributes for one piece of the reveal, from `start` to `end` ms. Outside the reveal, nothing: the page is
 * as before.
 */
export function useRevealAttributes() {
  const revealing = useContext(RevealingContext);
  return useCallback(
    (at: readonly [number, number], rise?: number): RevealAttributes =>
      revealing
        ? {
            "data-reveal": "",
            style: {
              "--reveal-at": `${at[0]}ms`,
              "--reveal-for": `${at[1] - at[0]}ms`,
              ...(rise == null ? null : { "--reveal-rise": `${rise}px` }),
            } as CSSProperties,
          }
        : {},
    [revealing],
  );
}

export function useIngredientReveal() {
  const attributes = useRevealAttributes();
  return useCallback((index: number, count: number) => attributes(ingredientRevealWindow(index, count), 8), [attributes]);
}

/** The pieces between the title tile and the ingredients come in just before the first ingredient. */
export const INGREDIENTS_HEAD = [SNAP_REVEAL.ingredientsFrom - 50, SNAP_REVEAL.ingredientsFrom + 200] as const;

/**
 * The notices, tools and tabs between the title tile and the ingredients, as one piece. Outside the reveal there is
 * no wrapper; inside, it keeps the recipe page's own gap.
 */
export function RevealHeadGroup({ children }: { children: ReactNode }) {
  const attributes = useRevealAttributes()(INGREDIENTS_HEAD);
  if (attributes["data-reveal"] == null) return <>{children}</>;
  return (
    <div {...attributes} className="flex flex-col gap-5 md:gap-6">
      {children}
    </div>
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Where the reveal is: playing, the card on its way to the Library, then landed (the strip shows). */
export function useSnapRevealPhase(active: boolean) {
  const [phase, setPhase] = useState<RevealPhase>(() => (active && !prefersReducedMotion() ? "playing" : "landed"));

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setTimeout(() => setPhase("flight"), SNAP_REVEAL.total);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const skip = useCallback(() => setPhase((current) => (current === "playing" ? "flight" : current)), []);
  const land = useCallback(() => setPhase("landed"), []);
  return { phase, skip, land };
}

/** The Library link on screen: the sidebar's on wide screens, else the bottom bar's (none on this page on phones). */
function libraryTarget(): DOMRect | null {
  for (const selector of ['[data-track="nav.sidebar.library"]', '[data-track="nav.tab.library"]']) {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) return rect;
  }
  return null;
}

const FLIGHT_SIZE = 112;

/**
 * The "Saved" moment: a small copy of the cover (or the title on the brand colour) leaves the cover's place and
 * drops toward the Library, then `onLanded`. Drawn with the Web Animations API, no library.
 */
export function SavedFlight({
  from,
  imageUrl,
  title,
  onLanded,
}: {
  from: () => HTMLElement | null;
  imageUrl: string | null;
  title: string;
  onLanded: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const landedRef = useRef(onLanded);
  useEffect(() => {
    landedRef.current = onLanded;
  });

  useEffect(() => {
    const card = ref.current;
    if (!card || typeof card.animate !== "function") {
      landedRef.current();
      return;
    }
    const rtl = document.documentElement.dir === "rtl";
    const source = from()?.getBoundingClientRect();
    const startX = source ? source.left + source.width / 2 : window.innerWidth / 2;
    const startY = source ? source.top + Math.min(source.height / 2, 200) : window.innerHeight / 3;
    const target = libraryTarget();
    // No Library link on screen (the phone-sized recipe page has no bars): the corner where the tab bar sits.
    const endX = target ? target.left + target.width / 2 : rtl ? window.innerWidth - 40 : 40;
    const endY = target ? target.top + target.height / 2 : window.innerHeight - 32;
    const half = FLIGHT_SIZE / 2;
    const at = (x: number, y: number, scale: number) => `translate(${x - half}px, ${y - half}px) scale(${scale})`;
    const animation = card.animate(
      [
        { transform: at(startX, startY, 1), opacity: 0 },
        { transform: at(startX, startY - 24, 1), opacity: 1, offset: 0.15 },
        { transform: at(endX, endY, 0.22), opacity: 0.9, offset: 0.9 },
        { transform: at(endX, endY, 0.2), opacity: 0 },
      ],
      { duration: SNAP_REVEAL.flight, easing: "cubic-bezier(0.55, 0, 0.75, 0.3)", fill: "forwards" },
    );
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      landedRef.current();
    };
    animation.onfinish = finish;
    // A background tab may never run it: land anyway.
    const fallback = window.setTimeout(finish, SNAP_REVEAL.flight + 400);
    return () => {
      window.clearTimeout(fallback);
      animation.cancel();
    };
  }, [from]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
      <div
        ref={ref}
        // The flight runs in screen coordinates (getBoundingClientRect), so it is anchored at the physical top-left
        // in both directions; RTL only changes where it lands.
        style={{ left: 0, top: 0, width: FLIGHT_SIZE, height: FLIGHT_SIZE, opacity: 0 }}
        // A surface-coloured edge, so a copy of the cover still stands out as it lifts off the cover itself.
        className="absolute grid place-items-center overflow-hidden rounded-tile border-2 border-surface bg-primary p-2.5 text-center text-xs font-semibold text-on-primary"
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a 112 px copy of a picture already on the page
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="line-clamp-3">{title}</span>
        )}
      </div>
    </div>
  );
}
