"use client";

import { ChefHat, ExternalLink, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button, buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { CookAlongVideo } from "@/lib/cook/cookAlongVideo";

/** "Start cooking": opens cook mode, one step at a time, big. The page's main action on a saved recipe. */
export function StartCookingButton({
  onCookMode,
  emphasis = "primary",
  size = "lg",
  className,
}: {
  onCookMode: () => void;
  /** "primary" when cooking is the page's main action (a saved recipe); "quiet" beside other actions (Save…). */
  emphasis?: "primary" | "quiet";
  size?: "md" | "lg";
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Button variant={emphasis === "primary" ? "primary" : "secondary"} size={size} trackId="recipe.cook_mode.open" onClick={onCookMode} className={className}>
      <ChefHat aria-hidden className="h-[18px] w-[18px]" />
      {t("web.library.startCooking")}
    </Button>
  );
}

// On a photo: a dark, blurred pill with a white square for the play icon.
const onPhoto =
  "flex max-w-full items-center gap-2.5 rounded-[18px] bg-scrim/70 py-2 ps-2 pe-4 text-start text-on-scrim backdrop-blur-md transition-colors hover:bg-scrim/80 md:p-2.5 md:pe-4";
const photoSquare = "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-on-scrim text-scrim md:h-10 md:w-10 md:rounded-xl";

/**
 * "Cook along with the video": shows or hides the source video beside the recipe. A video that can't be embedded
 * (a short link with no id) opens on its own site instead. `variant="photo"` sits on the recipe's photo; `"inline"`
 * is an ordinary button, for a recipe without a photo. Shows nothing for a recipe without a video.
 */
export function CookAlongButton({
  video,
  playerOpen,
  playerId,
  onTogglePlayer,
  variant,
  hint,
  className,
}: {
  video: CookAlongVideo | null;
  playerOpen: boolean;
  /** The player's element id, for aria-controls. */
  playerId: string;
  onTogglePlayer: () => void;
  variant: "photo" | "inline";
  /** A second line on the photo: "TikTok · jumps to each step". */
  hint?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!video) return null;
  const photo = variant === "photo";

  if (!video.embedUrl) {
    return (
      <a
        href={video.pageUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-track="recipe.video.open_external"
        className={cn(photo ? onPhoto : buttonClasses({ variant: "outline", size: "lg" }), className)}
      >
        {photo ? (
          <span aria-hidden className={photoSquare}>
            <Play className="h-3 w-3 fill-current md:h-4 md:w-4" />
          </span>
        ) : (
          <Play aria-hidden className="h-4 w-4 fill-current" />
        )}
        <span className={cn(photo && "text-[13px] font-bold md:text-[15px]")}>
          {t("web.cook.watchOn", { platform: video.label })}
          <span className="sr-only"> ({t("web.recipe.opensInNewTab")})</span>
        </span>
        <ExternalLink aria-hidden className={cn("h-4 w-4 rtl:-scale-x-100", photo ? "text-on-scrim-muted" : "text-muted")} />
      </a>
    );
  }

  const label = playerOpen ? t("web.cook.hideVideo") : photo ? t("web.library.cookAlongVideo") : t("cookAlong.title");
  if (photo) {
    return (
      <button
        type="button"
        data-track="recipe.video.toggle"
        onClick={onTogglePlayer}
        aria-expanded={playerOpen}
        aria-controls={playerOpen ? playerId : undefined}
        className={cn(onPhoto, className)}
      >
        <span aria-hidden className={photoSquare}>
          {playerOpen ? <X className="h-4 w-4" /> : <Play className="h-3 w-3 fill-current md:h-4 md:w-4" />}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-bold md:text-[15px]">{label}</span>
          {hint && !playerOpen ? <span className="truncate text-[13px] text-on-scrim-muted max-md:hidden">{hint}</span> : null}
        </span>
      </button>
    );
  }
  return (
    <Button
      variant={playerOpen ? "secondary" : "outline"}
      size="lg"
      trackId="recipe.video.toggle"
      onClick={onTogglePlayer}
      aria-expanded={playerOpen}
      aria-controls={playerOpen ? playerId : undefined}
      className={className}
    >
      {playerOpen ? <X aria-hidden className="h-[18px] w-[18px]" /> : <Play aria-hidden className="h-4 w-4 fill-current" />}
      {label}
      {playerOpen ? null : <span className="font-normal text-muted">· {video.label}</span>}
    </Button>
  );
}
