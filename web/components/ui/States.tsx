"use client";

import { CloudOff } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

/** While a page loads. Centred, with an optional line saying what is loading. */
export function LoadingState({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex min-h-64 flex-1 items-center justify-center p-6", className)}>
      <Spinner label={label} />
    </div>
  );
}

/** Something failed. Says so plainly and offers to try again, instead of a blank page. */
export function ErrorState({
  title,
  body,
  onRetry,
  className,
  trackId,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  className?: string;
  /** Activity-log id prefix (ADR 020): the retry button logs `<trackId>.retry`. */
  trackId?: string;
}) {
  const { t } = useTranslation();
  return (
    <div role="alert" className={cn("mx-auto flex max-w-sm flex-col items-center px-6 py-16 text-center", className)}>
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-danger-soft text-danger">
        <CloudOff aria-hidden className="h-7 w-7" />
      </span>
      <h2 className="text-lg font-bold text-text">{title ?? t("web.errorTitle")}</h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{body ?? t("common.tryAgain")}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-5" trackId={trackId ? `${trackId}.retry` : undefined} onClick={onRetry}>
          {t("common.tryAgainAction")}
        </Button>
      ) : null}
    </div>
  );
}

/** Nothing here yet. Explains what will appear and gives the one next step that fills it. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center", className)}>
      <span className="mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-primary-soft text-primary [&_svg]:h-8 [&_svg]:w-8">
        {icon}
      </span>
      <h2 className="text-xl font-bold text-balance text-text">{title}</h2>
      {body ? <p className="mt-2 text-[15px] leading-relaxed text-pretty text-muted">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
