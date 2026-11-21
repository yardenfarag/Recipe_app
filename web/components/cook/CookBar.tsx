"use client";

import { ChefHat, ExternalLink, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button, buttonClasses } from "@/components/ui/Button";
import type { CookAlongVideo } from "@/lib/cook/cookAlongVideo";

/**
 * The two ways to cook with the recipe open, under its header: cook mode (one step at a time, big), and cook
 * along (the source video beside the recipe). Cook along toggles the player; a video that can't be embedded (a
 * short link with no id) opens on its own site instead.
 */
export function CookBar({
  video,
  playerOpen,
  playerId,
  onTogglePlayer,
  onCookMode,
  emphasis,
}: {
  video: CookAlongVideo | null;
  playerOpen: boolean;
  /** The player's element id, for aria-controls. */
  playerId: string;
  onTogglePlayer: () => void;
  /** Null when there are no steps to cook from. */
  onCookMode: (() => void) | null;
  /** "primary" when cooking is the page's main action (a saved recipe); "quiet" beside other actions (Save…). */
  emphasis: "primary" | "quiet";
}) {
  const { t } = useTranslation();
  if (!video && !onCookMode) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="cook-bar">
      {onCookMode ? (
        <Button variant={emphasis === "primary" ? "primary" : "secondary"} onClick={onCookMode}>
          <ChefHat aria-hidden className="h-[18px] w-[18px]" />
          {t("web.cook.cookMode")}
        </Button>
      ) : null}
      {video?.embedUrl ? (
        <Button
          variant={playerOpen ? "secondary" : "outline"}
          onClick={onTogglePlayer}
          aria-expanded={playerOpen}
          aria-controls={playerOpen ? playerId : undefined}
        >
          {playerOpen ? <X aria-hidden className="h-[18px] w-[18px]" /> : <Play aria-hidden className="h-4 w-4 fill-current" />}
          {playerOpen ? t("web.cook.hideVideo") : t("cookAlong.title")}
          {playerOpen ? null : <span className="font-normal text-muted">· {video.label}</span>}
        </Button>
      ) : video ? (
        <a
          href={video.pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ variant: "outline" })}
        >
          <Play aria-hidden className="h-4 w-4 fill-current" />
          {t("web.cook.watchOn", { platform: video.label })}
          <span className="sr-only"> ({t("web.recipe.opensInNewTab")})</span>
          <ExternalLink aria-hidden className="h-4 w-4 text-muted rtl:-scale-x-100" />
        </a>
      ) : null}
    </div>
  );
}
