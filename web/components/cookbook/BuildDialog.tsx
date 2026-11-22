"use client";

import { Download, ExternalLink, ImageOff, Printer } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import type { CookbookBuildState } from "@/lib/cookbook/useCookbookBuild";

type Actions = {
  onClose: () => void;
  onRetry: () => void;
  onPrint: () => void;
  onDownloadAgain: () => void;
  onOpenInTab: () => void;
};

/**
 * What happens after Create PDF: a bar while the server makes the file, then "saved to your downloads" with the
 * choice to print it too, or what went wrong with printing still on offer. Closing it at any point (Cancel, Escape,
 * the X) stops the work.
 */
export function BuildDialog({ state, ...actions }: { state: CookbookBuildState } & Actions) {
  const { t } = useTranslation();
  const open = state.step !== "idle";

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : actions.onClose())}>
      {open ? <Body state={state} actions={actions} t={t} /> : null}
    </Dialog>
  );
}

function Progress({ label, percent }: { label: string; percent: number | null }) {
  return (
    <>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={percent === null ? undefined : 0}
        aria-valuemax={percent === null ? undefined : 100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={label}
        className="h-2.5 w-full overflow-hidden rounded-full bg-element"
      >
        {percent === null ? (
          <div className="h-full w-2/5 animate-indeterminate rounded-full bg-primary" />
        ) : (
          <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
        )}
      </div>
      <p aria-live="polite" className="mt-3 text-sm text-muted tabular-nums">
        {label}
      </p>
    </>
  );
}

function MissingPhotos({ count, t }: { count: number; t: ReturnType<typeof useTranslation>["t"] }) {
  if (count === 0) return null;
  return (
    <p className="flex items-start gap-2.5 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-text">
      <ImageOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      {t("web.cookbook.photosMissing", { count })}
    </p>
  );
}

function Body({
  state,
  actions,
  t,
}: {
  state: Exclude<CookbookBuildState, { step: "idle" }>;
  actions: Actions;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const cancel = (
    <Button variant="ghost" trackId="cookbook.build.cancel" onClick={actions.onClose}>
      {t("common.cancel")}
    </Button>
  );

  if (state.step === "making") {
    return (
      <DialogContent title={t("cookbook.generating")} footer={cancel}>
        <Progress label={t("web.cookbook.makingStep")} percent={null} />
        <p className="mt-1 text-sm text-muted">{t("web.cookbook.makingHint")}</p>
      </DialogContent>
    );
  }

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
      <DialogContent title={t("cookbook.generating")} footer={cancel}>
        <Progress label={label} percent={percent} />
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
            <Button variant="ghost" trackId="cookbook.build.close" onClick={actions.onClose}>
              {t("common.close")}
            </Button>
            {state.canPrint ? (
              <Button variant="outline" trackId="cookbook.build.print_instead" onClick={actions.onPrint}>
                <Printer aria-hidden className="h-4 w-4" />
                {t("web.cookbook.printInstead")}
              </Button>
            ) : null}
            <Button trackId="cookbook.build.retry" onClick={actions.onRetry}>
              {t("common.tryAgainAction")}
            </Button>
          </>
        }
      />
    );
  }

  if (state.via === "download") {
    return (
      <DialogContent
        title={t("cookbook.successTitle")}
        // Isolated, so a Hebrew name ending in .pdf keeps its own direction inside the sentence.
        description={t("web.cookbook.downloaded", { file: `\u2068${state.fileName}\u2069` })}
        className="max-w-lg"
        footer={
          <>
            <Button variant="ghost" trackId="cookbook.build.download_again" onClick={actions.onDownloadAgain}>
              <Download aria-hidden className="h-4 w-4" />
              {t("web.cookbook.downloadAgain")}
            </Button>
            <Button variant="outline" trackId="cookbook.build.print" onClick={actions.onPrint}>
              <Printer aria-hidden className="h-4 w-4" />
              {t("web.cookbook.print")}
            </Button>
            <Button trackId="cookbook.build.done" onClick={actions.onClose}>
              {t("web.cookbook.done")}
            </Button>
          </>
        }
      >
        <MissingPhotos count={state.missingPhotos} t={t} />
      </DialogContent>
    );
  }

  return (
    <DialogContent
      title={t("cookbook.successTitle")}
      description={t("cookbook.successBodyWeb")}
      className="max-w-lg"
      footer={
        <>
          <Link href="/" data-track="cookbook.build.back_to_library" className={cn(buttonClasses({ variant: "ghost" }))} onClick={actions.onClose}>
            {t("cookbook.backToLibrary")}
          </Link>
          <Button variant="outline" trackId="cookbook.build.open_tab" onClick={actions.onOpenInTab}>
            <ExternalLink aria-hidden className="h-4 w-4 rtl:-scale-x-100" />
            {t("web.cookbook.openInTab")}
          </Button>
          <Button trackId="cookbook.build.print_again" onClick={actions.onPrint}>
            <Printer aria-hidden className="h-4 w-4" />
            {t("web.cookbook.printAgain")}
          </Button>
        </>
      }
    >
      <MissingPhotos count={state.missingPhotos} t={t} />
    </DialogContent>
  );
}
