"use client";

import { ArrowLeft, BookOpen, CircleStop, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import type { BatchProgress, ChatExport, RecipeCandidate } from "@shared/lib/whatsappImport";

import { Button, buttonClasses } from "@/components/ui/Button";
import { Tile } from "@/components/ui/Tile";
import { ImportStatusRow } from "@/components/whatsapp/CandidateRow";
import { CREDITS_PATH } from "@/components/whatsapp/ReviewList";

/** The progress before the first item reports back: everything waiting. */
export function startingProgress(candidates: readonly RecipeCandidate[]): BatchProgress {
  return {
    total: candidates.length,
    done: 0,
    saved: 0,
    alreadySaved: 0,
    failed: 0,
    stoppedForCredits: false,
    cancelled: false,
    items: Object.fromEntries(candidates.map((candidate) => [candidate.id, "waiting" as const])),
    recipeIds: {},
  };
}

/** The import running: how far it is, each item's state, and Stop. */
export function ImportProgress({
  candidates,
  chat,
  progress,
  stopping,
  onStop,
}: {
  candidates: readonly RecipeCandidate[];
  chat: Pick<ChatExport, "readPhoto">;
  progress: BatchProgress;
  /** Stop was pressed: the items in flight finish, nothing new starts. */
  stopping: boolean;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-4">
      <Tile as="section" aria-labelledby="whatsapp-progress-heading" className="p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1 basis-56">
            <h2 id="whatsapp-progress-heading" aria-live="polite" className="text-[22px] leading-tight font-bold text-text tabular-nums">
              {t("whatsappImport.importing", { done: progress.done, total: progress.total })}
            </h2>
            <p className="mt-1 text-[15px] text-muted">{t("whatsappImport.keepOpenWeb")}</p>
          </div>
          <Button variant="outline" trackId="whatsapp_import.stop" busy={stopping} onClick={onStop}>
            <CircleStop aria-hidden className="h-4 w-4" />
            {t("whatsappImport.stop")}
          </Button>
        </div>
        <div
          role="progressbar"
          aria-labelledby="whatsapp-progress-heading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-5 h-2.5 overflow-hidden rounded-full bg-element"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
        </div>
      </Tile>
      <BatchRows candidates={candidates} chat={chat} progress={progress} />
    </div>
  );
}

function BatchRows({
  candidates,
  chat,
  progress,
  finished = false,
}: {
  candidates: readonly RecipeCandidate[];
  chat: Pick<ChatExport, "readPhoto">;
  progress: BatchProgress;
  finished?: boolean;
}) {
  return (
    <Tile as="section" className="p-3 sm:p-4 md:p-5">
      <ul className="flex flex-col gap-0.5">
        {candidates.map((candidate) => (
          <ImportStatusRow
            key={candidate.id}
            candidate={candidate}
            chat={chat}
            state={progress.items[candidate.id] ?? "waiting"}
            recipeId={progress.recipeIds[candidate.id]}
            finished={finished}
          />
        ))}
      </ul>
    </Tile>
  );
}

/**
 * The import is over: what was saved, what failed and why it stopped, with the ways on (the Library, the failed
 * ones again, more credits, back to the rest of the list, another chat).
 */
export function ImportDone({
  candidates,
  chat,
  progress,
  dailyLimit = false,
  onRetryFailed,
  onBackToList,
  onChooseAnother,
}: {
  candidates: readonly RecipeCandidate[];
  chat: Pick<ChatExport, "readPhoto">;
  progress: BatchProgress;
  /** It stopped at the day's import limit, not for credits (`stoppedForCredits` is set for both). */
  dailyLimit?: boolean;
  onRetryFailed: () => void;
  /** Left out when nothing is left on the list. */
  onBackToList?: () => void;
  onChooseAnother: () => void;
}) {
  const { t } = useTranslation();
  const inLibrary = progress.saved + progress.alreadySaved;
  const stopped = progress.stoppedForCredits || progress.cancelled;
  const outOfCredits = progress.stoppedForCredits && !dailyLimit;
  return (
    <div className="flex flex-col gap-4">
      <Tile as="section" aria-labelledby="whatsapp-done-heading" className="p-5 md:p-6">
        <h2 id="whatsapp-done-heading" className="text-[26px] leading-tight font-bold text-text">
          {stopped ? t("whatsappImport.doneSaved", { count: inLibrary }) : t("whatsappImport.doneTitle")}
        </h2>
        <ul role="status" className="mt-2 flex flex-col gap-1 text-[15px] leading-relaxed text-muted">
          {stopped ? null : <li>{t("whatsappImport.doneSaved", { count: inLibrary })}</li>}
          {progress.failed > 0 ? <li className="font-semibold text-danger">{t("whatsappImport.doneFailed", { count: progress.failed })}</li> : null}
          {progress.stoppedForCredits ? (
            <li>{t(dailyLimit ? "whatsappImport.doneDailyLimit" : "whatsappImport.doneOutOfCredits")}</li>
          ) : progress.cancelled ? (
            <li>{t("whatsappImport.doneStopped")}</li>
          ) : null}
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link href="/" data-track="whatsapp_import.done.library" className={buttonClasses({ variant: "primary" })}>
            <BookOpen aria-hidden className="h-4 w-4" />
            {t("whatsappImport.goToLibrary")}
          </Link>
          {progress.failed > 0 ? (
            <Button variant="secondary" trackId="whatsapp_import.done.retry" onClick={onRetryFailed}>
              <RotateCcw aria-hidden className="h-4 w-4" />
              {t("whatsappImport.retryFailed")}
            </Button>
          ) : null}
          {outOfCredits ? (
            <Link href={CREDITS_PATH} data-track="whatsapp_import.done.get_credits" className={buttonClasses({ variant: "outline" })}>
              {t("whatsappImport.getCredits")}
            </Link>
          ) : null}
          {onBackToList ? (
            <Button variant="outline" trackId="whatsapp_import.done.back" onClick={onBackToList}>
              <ArrowLeft aria-hidden className="h-4 w-4 rtl:rotate-180" />
              {t("common.back")}
            </Button>
          ) : null}
          <Button variant="ghost" trackId="whatsapp_import.done.another" onClick={onChooseAnother}>
            {t("whatsappImport.chooseAnother")}
          </Button>
        </div>
      </Tile>
      <BatchRows candidates={candidates} chat={chat} progress={progress} finished />
    </div>
  );
}
