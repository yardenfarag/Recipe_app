"use client";

import { ExternalLink, ImageOff, Printer } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import type { CookbookBuildState } from "@/lib/cookbook/useCookbookBuild";

/**
 * What happens after Create PDF: how far the photos are, then the pages, then "ready" with the print dialog open
 * over it, or what went wrong. Closing it at any point (Cancel, Escape, the X) stops the work.
 */
export function BuildDialog({
  state,
  onClose,
  onRetry,
  onPrintAgain,
  onOpenInTab,
}: {
  state: CookbookBuildState;
  onClose: () => void;
  onRetry: () => void;
  onPrintAgain: () => void;
  onOpenInTab: () => void;
}) {
  const { t } = useTranslation();
  const open = state.step !== "idle";

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      {open ? <Body state={state} onClose={onClose} onRetry={onRetry} onPrintAgain={onPrintAgain} onOpenInTab={onOpenInTab} t={t} /> : null}
    </Dialog>
  );
}

function Body({
  state,
  onClose,
  onRetry,
  onPrintAgain,
  onOpenInTab,
  t,
}: {
  state: Exclude<CookbookBuildState, { step: "idle" }>;
  onClose: () => void;
  onRetry: () => void;
  onPrintAgain: () => void;
  onOpenInTab: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  if (state.step === "photos" || state.step === "pages") {
    const label =
      state.step === "photos" && state.total > 0
        ? t("cookbook.generatingProgress", { done: state.done, total: state.total })
        : state.step === "pages"
          ? t("web.cookbook.pagesStep")
          : t("cookbook.generating");
    // Photos are most of the wait, so they fill most of the bar; laying out the pages is the last stretch.
    const percent = state.step === "photos" ? (state.total > 0 ? Math.round((state.done / state.total) * 90) : 0) : 95;
    return (
      <DialogContent
        title={t("cookbook.generating")}
        footer={
          <Button variant="ghost" trackId="cookbook.build.cancel" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        }
      >
        <div
          role="progressbar"
          aria-label={t("cookbook.generating")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={label}
          className="h-2.5 w-full overflow-hidden rounded-full bg-element"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
        </div>
        <p aria-live="polite" className="mt-3 text-sm text-muted tabular-nums">
          {label}
        </p>
      </DialogContent>
    );
  }

  if (state.step === "failed") {
    return (
      <DialogContent
        title={t("cookbook.errorTitle")}
        description={state.message}
        footer={
          <>
            <Button variant="ghost" trackId="cookbook.build.close" onClick={onClose}>
              {t("common.close")}
            </Button>
            <Button trackId="cookbook.build.retry" onClick={onRetry}>
              {t("common.tryAgainAction")}
            </Button>
          </>
        }
      />
    );
  }

  return (
    <DialogContent
      title={t("cookbook.successTitle")}
      description={t("cookbook.successBodyWeb")}
      className="max-w-lg"
      footer={
        <>
          <Link href="/" data-track="cookbook.build.back_to_library" className={cn(buttonClasses({ variant: "ghost" }))} onClick={onClose}>
            {t("cookbook.backToLibrary")}
          </Link>
          <Button variant="outline" trackId="cookbook.build.open_tab" onClick={onOpenInTab}>
            <ExternalLink aria-hidden className="h-4 w-4 rtl:-scale-x-100" />
            {t("web.cookbook.openInTab")}
          </Button>
          <Button trackId="cookbook.build.print_again" onClick={onPrintAgain}>
            <Printer aria-hidden className="h-4 w-4" />
            {t("web.cookbook.printAgain")}
          </Button>
        </>
      }
    >
      {state.missingPhotos > 0 ? (
        <p className="flex items-start gap-2.5 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-text">
          <ImageOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          {t("web.cookbook.photosMissing", { count: state.missingPhotos })}
        </p>
      ) : null}
    </DialogContent>
  );
}
