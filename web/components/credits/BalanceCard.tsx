"use client";

import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FREE_MONTHLY_EXTRACT_LIMIT } from "@shared/lib/quotas";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useCreditBalance } from "@/lib/credits/balance";
import { formatCount, formatResetDate, nextFreeReset } from "@/lib/credits/format";

/**
 * The balance at a glance: the total, then where it comes from. Free credits are a monthly allowance with a reset
 * date; bought ones never expire. Free ones are spent first, which is worth knowing before buying.
 */
export function BalanceCard() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { quota, loading, refresh } = useCreditBalance();
  const limit = FREE_MONTHLY_EXTRACT_LIMIT;
  const freeLeft = quota?.freeExtractsRemaining ?? 0;
  const empty = quota != null && quota.totalCredits <= 0;

  return (
    <section
      aria-labelledby="credits-balance"
      className={cn(
        "rounded-3xl border bg-surface p-5 shadow-soft sm:p-6",
        empty ? "border-accent" : "border-frosted-border",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="credits-balance" className="text-sm font-semibold text-muted">
            {t("web.credits.available")}
          </h2>
          {quota ? (
            <p className="mt-1 text-5xl font-bold tracking-tight text-text tabular-nums" aria-live="polite">
              {formatCount(quota.totalCredits, language)}
            </p>
          ) : loading ? (
            <p aria-hidden className="mt-2 h-12 w-24 rounded-2xl bg-element motion-safe:animate-pulse" />
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted">{t("web.credits.balanceFailed")}</p>
              <Button variant="secondary" size="sm" trackId="credits.balance.retry" onClick={() => void refresh()}>
                {t("common.tryAgainAction")}
              </Button>
            </div>
          )}
        </div>
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Coins className="h-6 w-6" />
        </span>
      </div>

      {quota ? (
        <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 sm:gap-6">
          <div>
            <dt className="text-sm font-semibold text-text">{t("web.credits.freeThisMonth")}</dt>
            <dd className="mt-1 text-sm text-muted">
              <span className="font-semibold text-text tabular-nums">
                {t("web.credits.freeLeft", { left: formatCount(freeLeft, language), limit: formatCount(limit, language) })}
              </span>
              <span
                aria-hidden
                className="mt-2 block h-1.5 overflow-hidden rounded-full bg-element"
              >
                <span
                  className="block h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.round((Math.min(freeLeft, limit) / limit) * 100)}%` }}
                />
              </span>
              <span className="mt-2 block">
                {t("web.credits.resetsOn", { limit: formatCount(limit, language), date: formatResetDate(nextFreeReset(), language) })}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-text">{t("web.credits.purchased")}</dt>
            <dd className="mt-1 text-sm text-muted">
              <span className="font-semibold text-text tabular-nums">{formatCount(quota.purchasedCredits, language)}</span>
              <span className="mt-2 block">{t("credits.neverExpire")}</span>
            </dd>
          </div>
        </dl>
      ) : null}

      {quota ? <p className="mt-5 text-xs leading-relaxed text-muted">{t("web.credits.spendOrder")}</p> : null}
    </section>
  );
}
