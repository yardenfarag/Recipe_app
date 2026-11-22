"use client";

import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FREE_MONTHLY_EXTRACT_LIMIT } from "@shared/lib/quotas";

import { Button } from "@/components/ui/Button";
import { Tile, TileLabel } from "@/components/ui/Tile";
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
    <Tile as="section" aria-labelledby="credits-balance" className={empty ? "border-accent p-5 sm:p-6" : "p-5 sm:p-6"}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <TileLabel as="h2" id="credits-balance">
            {t("web.credits.available")}
          </TileLabel>
          {quota ? (
            <p className="mt-3 font-display text-6xl leading-none font-bold text-accent-text tabular-nums" aria-live="polite">
              {formatCount(quota.totalCredits, language)}
            </p>
          ) : loading ? (
            <p aria-hidden className="mt-3 h-[60px] w-28 rounded-2xl bg-element motion-safe:animate-pulse" />
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted">{t("web.credits.balanceFailed")}</p>
              <Button variant="secondary" size="sm" trackId="credits.balance.retry" onClick={() => void refresh()}>
                {t("common.tryAgainAction")}
              </Button>
            </div>
          )}
        </div>
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
          <Coins className="h-5 w-5" />
        </span>
      </div>

      {quota ? (
        <dl className="mt-6 grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-2xl bg-element p-4">
            <dt className="text-sm font-semibold text-muted">{t("web.credits.freeThisMonth")}</dt>
            <dd className="mt-1.5 text-sm text-muted">
              <span className="font-display text-[22px] leading-tight font-bold text-text tabular-nums">
                {t("web.credits.freeLeft", { left: formatCount(freeLeft, language), limit: formatCount(limit, language) })}
              </span>
              <span aria-hidden className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-surface">
                <span
                  className="block h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.round((Math.min(freeLeft, limit) / limit) * 100)}%` }}
                />
              </span>
              <span className="mt-2.5 block">
                {t("web.credits.resetsOn", { limit: formatCount(limit, language), date: formatResetDate(nextFreeReset(), language) })}
              </span>
            </dd>
          </div>
          <div className="rounded-2xl bg-element p-4">
            <dt className="text-sm font-semibold text-muted">{t("web.credits.purchased")}</dt>
            <dd className="mt-1.5 text-sm text-muted">
              <span className="font-display text-[22px] leading-tight font-bold text-text tabular-nums">{formatCount(quota.purchasedCredits, language)}</span>
              <span className="mt-2.5 block">{t("credits.neverExpire")}</span>
            </dd>
          </div>
        </dl>
      ) : null}

      {quota ? <p className="mt-4 text-[13px] leading-relaxed text-muted">{t("web.credits.spendOrder")}</p> : null}
    </Tile>
  );
}
