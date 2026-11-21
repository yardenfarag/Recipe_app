"use client";

import { ChevronRight, Coins } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { FREE_MONTHLY_EXTRACT_LIMIT } from "@shared/lib/quotas";

import { GetTheAppCard } from "@/components/credits/GetTheAppCard";
import { PackList } from "@/components/credits/PackList";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { useCreditBalance } from "@/lib/credits/balance";
import { formatResetDate, nextFreeReset } from "@/lib/credits/format";
import { useWebSalesOn } from "@/lib/credits/salesSwitch";

/**
 * The prompt shown when an action needs more credits than the account has: Snap, guess, repair. It shows the balance
 * and the packs, and buying one goes through Polar and comes back to the same page, where CheckoutReturnDialog says
 * the payment arrived and the balance updates (PIN-141).
 *
 * Contract for callers (do not change the props without updating every caller):
 * - Render it once near the action and control it with `open` / `onOpenChange`.
 * - `needed` is what the action costs, when known, so the prompt can say "This needs 2 credits".
 */
export function OutOfCreditsDialog({
  open,
  onOpenChange,
  needed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  needed?: number;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const salesOn = useWebSalesOn();
  const { quota, refresh } = useCreditBalance();

  // The server just said there weren't enough: show the balance as it is now, not as it was.
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const total = quota?.totalCredits;
  // Some credits, but fewer than this needs: say how many it takes. Otherwise they're simply out.
  const short = needed != null && needed > 1 && total != null && total > 0 && total < needed;
  const date = formatResetDate(nextFreeReset(), language);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        title={short ? t("web.credits.needMoreTitle", { count: needed }) : t("web.credits.outTitle")}
        description={t("web.credits.outBody", { limit: FREE_MONTHLY_EXTRACT_LIMIT, date })}
      >
        <div className="space-y-4">
          {total != null ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent">
              <Coins aria-hidden className="h-4 w-4" />
              {t("settings.creditsTotal", { count: total })}
            </p>
          ) : null}
          {salesOn ? <PackList variant="rows" /> : <GetTheAppCard compact />}
          <Link
            href="/settings/credits"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t("web.credits.seeAll")}
            <ChevronRight aria-hidden className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
