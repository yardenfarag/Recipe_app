"use client";

import { useTranslation } from "react-i18next";

import type { CookbookPageSize } from "@shared/lib/cookbook/buildCookbookHtml";

import { CookieMark } from "@/components/CookieMark";
import { cn } from "@/lib/cn";

/**
 * A small picture of the book's cover, as it will print: the cookie, "Made with Pinch", the title and how many
 * recipes. Its shape follows the paper size. Only a picture: screen readers get the same from the fields beside it.
 */
export function CoverPreview({
  title,
  count,
  pageSize,
  className,
}: {
  title: string;
  count: number;
  pageSize: CookbookPageSize;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      aria-hidden
      data-testid="cookbook-cover-preview"
      className={cn(
        "relative isolate flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-border bg-linear-to-b from-primary-soft via-surface to-surface-soft px-2 text-center transition-[aspect-ratio] duration-200",
        pageSize === "letter" ? "aspect-[8.5/11]" : "aspect-[210/297]",
        className,
      )}
    >
      <span className="absolute -top-4 -start-5 -z-10 h-14 w-14 rounded-full bg-primary-soft blur-[2px]" />
      <span className="absolute -end-4 bottom-4 -z-10 h-10 w-10 rounded-full bg-accent-soft blur-[2px]" />
      <CookieMark size={16} className="mb-1.5 text-primary-text" />
      <span className="text-[6px] font-medium tracking-[0.18em] text-muted uppercase rtl:tracking-normal">{t("cookbook.madeWith")}</span>
      <span className="mt-1 line-clamp-3 text-[11px] leading-tight font-bold break-words text-text">
        {title.trim() || t("cookbook.defaultTitle")}
      </span>
      <span className="mt-1 text-[7px] text-muted">
        {count === 1 ? t("cookbook.recipeCountOne", { count }) : t("cookbook.recipeCountOther", { count })}
      </span>
    </div>
  );
}
