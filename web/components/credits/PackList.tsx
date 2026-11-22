"use client";

import { ChevronRight, Coins, LockKeyhole } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  BEST_VALUE_PACK_ID,
  CREDIT_PACKS,
  pricePerCreditUsd,
  savingsVersusSmallest,
  type CreditPackDefinition,
  type CreditPackId,
} from "@shared/lib/creditPacks";
import { CheckoutError } from "@shared/lib/supabase/creditPurchases";

import { ErrorAlert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Tile, TileBadge } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import { startCheckout } from "@/lib/credits/checkout";
import { formatPercent, formatUsd } from "@/lib/credits/format";

type PackText = { name: string; price: string; perCredit: string; saving: string | null; featured: boolean; label: string };

function usePackText() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  return (pack: CreditPackDefinition): PackText => {
    const name = t("credits.packRecipes", { count: pack.credits });
    const price = formatUsd(pack.priceUsd, language);
    const saving = savingsVersusSmallest(pack);
    return {
      name,
      price,
      perCredit: t("web.credits.perCredit", { price: formatUsd(pricePerCreditUsd(pack), language) }),
      saving: saving > 0 ? t("web.credits.save", { percent: formatPercent(saving, language) }) : null,
      featured: pack.id === BEST_VALUE_PACK_ID,
      label: t("web.credits.buyPackLabel", { pack: name, price }),
    };
  };
}

/**
 * The three credit packs with their prices, and buying one: Polar's checkout opens in this tab and comes back to
 * this page. `cards` is the credits page's row of cards; `rows` is the compact list in the out-of-credits prompt.
 *
 * Only shown while web sales are on; callers show GetTheAppCard otherwise.
 */
export function PackList({ variant }: { variant: "cards" | "rows" }) {
  const { t } = useTranslation();
  const describe = usePackText();
  const noteId = useId();
  const [busyId, setBusyId] = useState<CreditPackId | null>(null);
  const [failed, setFailed] = useState(false);

  // Back from Polar with the browser's Back button: the page may come back from the cache, mid-"opening".
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setBusyId(null);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function buy(id: CreditPackId) {
    if (busyId) return;
    setBusyId(id);
    setFailed(false);
    try {
      await startCheckout(id);
      // The tab is on its way to Polar; keep "Opening…" until it leaves.
    } catch (error) {
      setBusyId(null);
      // Sales switched off on the server: the caller swaps the packs for "buy in the app", which is no error.
      if (!(error instanceof CheckoutError && error.reason === "sales_off")) setFailed(true);
    }
  }

  const status = (
    <div aria-live="polite" className="empty:hidden">
      {busyId ? <p className="text-sm font-semibold text-primary-text">{t("credits.webCheckoutOpened")}</p> : null}
    </div>
  );
  const error = failed ? <ErrorAlert>{t("credits.purchaseFailed")}</ErrorAlert> : null;
  const note = (
    <p id={noteId} className="flex items-start gap-2 text-xs leading-relaxed text-muted">
      <LockKeyhole aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{t("web.credits.checkoutNote")}</span>
    </p>
  );

  if (variant === "rows") {
    return (
      <div className="space-y-3">
        <ul className="space-y-2">
          {CREDIT_PACKS.map((pack) => {
            const text = describe(pack);
            const busy = busyId === pack.id;
            return (
              <li key={pack.id}>
                <button
                  type="button"
                  data-track="credits.pack.buy"
                  aria-label={text.label}
                  aria-describedby={noteId}
                  aria-busy={busy || undefined}
                  disabled={Boolean(busyId)}
                  onClick={() => void buy(pack.id)}
                  className={cn(
                    "group flex min-h-16 w-full items-center gap-3 rounded-2xl bg-element p-3 text-start transition-colors hover:bg-selected disabled:cursor-default",
                    text.featured && "ring-2 ring-primary ring-inset",
                    busyId && !busy && "opacity-50",
                  )}
                >
                  <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-accent-text">
                    <Coins className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-display text-[17px] font-bold text-text">{text.name}</span>
                      {text.featured ? <TileBadge className="bg-primary px-2 py-1 text-[11px] text-on-primary">{t("credits.bestValue")}</TileBadge> : null}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted">
                      {text.perCredit}
                      {text.saving ? <> · <span className="font-semibold text-success">{text.saving}</span></> : null}
                    </span>
                  </span>
                  {busy ? (
                    <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
                  ) : (
                    <span className="flex items-center gap-1 font-display text-lg font-bold text-primary-text tabular-nums">
                      {text.price}
                      <ChevronRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {status}
        {error}
        {note}
      </div>
    );
  }

  return (
    <div className="@container space-y-4">
      <ul className="grid gap-4 @xl:grid-cols-3">
        {CREDIT_PACKS.map((pack) => {
          const text = describe(pack);
          return (
            <Tile as="li" size="md" key={pack.id} className={cn("flex flex-col p-5", text.featured && "border-primary ring-1 ring-primary")}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <h3 className="text-lg font-bold text-text">{text.name}</h3>
                {text.featured ? <TileBadge>{t("credits.bestValue")}</TileBadge> : null}
              </div>
              <p className="mt-4 font-display text-5xl leading-none font-bold text-text tabular-nums">{text.price}</p>
              <p className="mt-2.5 text-sm text-muted">{text.perCredit}</p>
              <p className="mt-1 min-h-5 text-sm font-semibold text-success">{text.saving}</p>
              <Button
                className="mt-5 @xl:mt-auto"
                fullWidth
                variant={text.featured ? "primary" : "secondary"}
                busy={busyId === pack.id}
                disabled={Boolean(busyId) && busyId !== pack.id}
                aria-label={text.label}
                aria-describedby={noteId}
                trackId="credits.pack.buy"
                onClick={() => void buy(pack.id)}
              >
                {t("web.credits.buy")}
              </Button>
            </Tile>
          );
        })}
      </ul>
      {status}
      {error}
      {note}
    </div>
  );
}
