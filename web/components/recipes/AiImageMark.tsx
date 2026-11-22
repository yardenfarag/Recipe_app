"use client";

import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";

/**
 * The small mark on a picture Pinch drew (recipe.image_generated), so it is never taken for a photo of the dish.
 * A sparkle on a dark backing in a corner of the picture; hovering says what it means. Place it in a `relative` box.
 */
export function AiImageMark({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  const { t } = useTranslation();
  return (
    <Tooltip label={t("recipe.aiImageHint")}>
      <span
        role="img"
        aria-label={t("recipe.aiImage")}
        data-testid="ai-image-mark"
        className={cn(
          "pointer-events-auto absolute z-10 grid place-items-center rounded-full bg-scrim/70 text-on-scrim backdrop-blur-sm",
          size === "sm" ? "bottom-1 end-1 h-5 w-5" : "bottom-2 start-2 h-7 w-7 md:bottom-3 md:start-3",
          className,
        )}
      >
        <Sparkles aria-hidden className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      </span>
    </Tooltip>
  );
}
