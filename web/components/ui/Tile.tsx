"use client";

import { useCallback, useState, type ElementType, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type Tone = "surface" | "primary" | "element" | "plain";

const tones: Record<Tone, string> = {
  surface: "border border-border bg-surface text-text",
  // The one tile on a page that asks for the main action.
  primary: "bg-primary text-on-primary",
  // A tile inside a tile (a fact, a number).
  element: "bg-element text-text",
  plain: "",
};

/** The classes of a bento tile, for links and buttons that are one. */
export const tileClasses = ({ tone = "surface", size = "lg", className }: { tone?: Tone; size?: "sm" | "md" | "lg"; className?: string } = {}) =>
  cn(size === "lg" ? "rounded-tile" : size === "md" ? "rounded-3xl" : "rounded-2xl", tones[tone], className);

/**
 * A bento tile: the block every Night Market screen is built from. Rounded 28 px, on the surface colour with a
 * hairline border. `size="md"` (24 px corners) is for cards in a list, `size="sm"` (16 px) for a tile inside a tile.
 */
export function Tile({
  as: Component = "div",
  tone = "surface",
  size = "lg",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: ElementType; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  return <Component {...props} className={tileClasses({ tone, size, className })} />;
}

/** The small-caps line at the top of a tile: "COOKED THIS WEEK". Not capitalised or spaced out in Hebrew and Arabic. */
export function TileLabel({ as: Component = "p", className, ...props }: HTMLAttributes<HTMLElement> & { as?: ElementType }) {
  return (
    <Component
      {...props}
      className={cn("text-[13px] leading-snug font-semibold tracking-[0.06em] text-muted uppercase rtl:tracking-normal", className)}
    />
  );
}

/** The same small caps as a filled badge, on a tile or over a photo: "TONIGHT'S PICK", "SAVED FROM TIKTOK". */
export function TileBadge({ tone = "soft", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "soft" | "photo" }) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-display text-xs leading-none font-bold tracking-[0.08em] uppercase rtl:tracking-normal",
        tone === "photo" ? "bg-scrim-primary text-on-scrim-primary" : "bg-primary-soft text-primary-text",
        className,
      )}
    />
  );
}

/**
 * Whether a photo has arrived, so it can fade in over a placeholder instead of popping in (PIN-176). A photo the
 * browser already has (the card's photo, opened as the recipe's) counts as arrived at once, with no fade.
 */
export function usePhotoLoaded(src: string | null | undefined) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const ref = useCallback(
    (img: HTMLImageElement | null) => {
      if (img && src && img.complete && img.naturalWidth > 0) setLoadedSrc(src);
    },
    [src],
  );
  return { loaded: Boolean(src) && loadedSrc === src, ref, onLoad: () => setLoadedSrc(src ?? null) };
}

/** The classes of a photo that fades in once it has loaded. */
const photoFadeClasses = (loaded: boolean) =>
  cn("motion-safe:transition-opacity motion-safe:duration-300", loaded ? "opacity-100" : "opacity-0");

/**
 * A photo filling a tile, fading to dark at the bottom, with words and buttons on top. The text colours over the
 * photo are the pack's dark ones in light mode too (text-on-scrim, text-on-scrim-muted), since a photo doesn't
 * change with the theme. Without a photo (or when it fails to load) `fallback` fills the tile instead.
 */
export function PhotoTile({
  src,
  alt = "",
  fallback,
  fade = "bottom",
  onPhotoError,
  priority = false,
  children,
  className,
  contentClassName,
  as: Component = "div",
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** Called when the photo fails to load, for an owner that lays itself out differently without one. */
  onPhotoError?: () => void;
  /** The page's main photo: fetched before the others. */
  priority?: boolean;
  src?: string | null;
  alt?: string;
  /** Shown behind the content when there is no photo. */
  fallback?: ReactNode;
  /**
   * "bottom" darkens the lower part for text; "strong" darkens more of it and blurs it too, for a tall block of text
   * over any photo, even a light one or one with words in it; "none" leaves the photo alone (buttons on it bring
   * their own backing).
   */
  fade?: "bottom" | "strong" | "none";
  children?: ReactNode;
  contentClassName?: string;
  as?: ElementType;
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(src) && !failed;
  const { loaded: photoLoaded, ref: photoRef, onLoad: onPhotoLoad } = usePhotoLoaded(src);
  return (
    <Component {...props} className={cn("relative isolate overflow-hidden rounded-tile bg-scrim text-on-scrim", className)}>
      {showPhoto ? (
        <>
          {photoLoaded ? null : <div aria-hidden className="absolute inset-0 -z-20 bg-element motion-safe:animate-pulse" />}
          {/* Our own copies, sized at import (PIN-176); resizing per screen would need a paid image service (ADR 027). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={photoRef}
            src={src ?? undefined}
            alt={alt}
            decoding="async"
            fetchPriority={priority ? "high" : undefined}
            onLoad={onPhotoLoad}
            onError={() => {
              setFailed(true);
              onPhotoError?.();
            }}
            className={cn("absolute inset-0 -z-20 h-full w-full object-cover", photoFadeClasses(photoLoaded))}
          />
        </>
      ) : (
        <div aria-hidden className="absolute inset-0 -z-20 grid place-items-center bg-scrim text-on-scrim-muted">
          {fallback}
        </div>
      )}
      {fade === "bottom" ? <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-b from-scrim/0 from-30% to-scrim/90" /> : null}
      {fade === "strong" ? (
        <>
          {/* The blur comes in under the text, so writing in the photo can't be read through ours; the top stays sharp. */}
          <div aria-hidden className="absolute inset-0 -z-10 backdrop-blur-2xl [mask-image:linear-gradient(to_bottom,transparent_20%,black_45%)]" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-b from-scrim/0 from-10% via-scrim/80 via-45% to-scrim/95" />
        </>
      ) : null}
      {children ? <div className={cn("relative flex h-full flex-col justify-end", contentClassName)}>{children}</div> : null}
    </Component>
  );
}

/** One fact as a tile: a big number over (or beside) a small label. */
export function StatTile({
  label,
  value,
  aside,
  tone = "surface",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Something at the end of the number's row: photos, an icon. */
  aside?: ReactNode;
  tone?: "surface" | "element";
  className?: string;
}) {
  return (
    <Tile tone={tone} className={cn("flex flex-col justify-between gap-3 p-5 sm:p-[22px]", className)}>
      <TileLabel>{label}</TileLabel>
      <div className="flex items-end justify-between gap-3">
        <span className="font-display text-6xl leading-none font-bold text-accent-text tabular-nums">{value}</span>
        {aside}
      </div>
    </Tile>
  );
}

/**
 * A small fact inside a tile: the value big, the label small under it ("25m" / "Total time"). Four of them sit in
 * a row on the recipe page.
 */
export function FactTile({ value, label, className, ...props }: Omit<HTMLAttributes<HTMLDivElement>, "children"> & { value: ReactNode; label: ReactNode }) {
  return (
    <div {...props} className={cn("flex min-w-0 flex-col gap-0.5 rounded-2xl bg-element px-3.5 py-3", className)}>
      <span className="font-display text-[22px] leading-tight font-bold text-text">{value}</span>
      <span className="text-xs leading-snug font-semibold text-muted">{label}</span>
    </div>
  );
}
