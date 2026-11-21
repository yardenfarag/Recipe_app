"use client";

import { Check, Hourglass } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { showToast } from "@shared/lib/toast";

import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { useCreditBalance } from "@/lib/credits/balance";
import { useCheckoutReturn } from "@/lib/credits/useCheckoutReturn";
import { useFirstMounted } from "@/lib/credits/useFirstMounted";

/**
 * "Payment received", after Polar's checkout sends the buyer back to the page they bought from. It waits for
 * polar-webhook to add the credits (usually seconds), then shows how many arrived and the new balance; every other
 * balance on the page updates too. Closing it while waiting is fine: a toast says when the credits land.
 *
 * Mount it anywhere in the signed-in shell; it may be mounted more than once (the account menu is), and only the
 * first instance does anything.
 */
export function CheckoutReturnDialog() {
  const first = useFirstMounted("checkout-return");
  return first ? <CheckoutReturn /> : null;
}

function CheckoutReturn() {
  const { t } = useTranslation();
  const { quota } = useCreditBalance();
  const onQuietlyAdded = useCallback((credits: number) => showToast(t("credits.webPurchaseAdded", { count: credits })), [t]);
  const { state, dismiss } = useCheckoutReturn({ enabled: true, onQuietlyAdded });

  if (!state) return null;
  const added = state.kind === "added";
  const message = added
    ? t("credits.webPurchaseAdded", { count: state.credits })
    : state.kind === "slow"
      ? t("credits.webPurchaseSlow")
      : t("credits.webPurchaseWaiting");

  return (
    <Dialog open onOpenChange={(open) => !open && dismiss()}>
      <DialogContent
        title={t("credits.webPurchaseTitle")}
        footer={
          <>
            {state.kind === "slow" ? (
              <Link href="/settings/support" data-track="credits.web_purchase.contact_support" onClick={dismiss} className={buttonClasses({ variant: "ghost" })}>
                {t("web.credits.contactSupport")}
              </Link>
            ) : null}
            <DialogClose asChild>
              <Button variant={added ? "primary" : "secondary"} trackId="credits.web_purchase_done">{added ? t("credits.webPurchaseDone") : t("common.close")}</Button>
            </DialogClose>
          </>
        }
      >
        <div className="flex flex-col items-center text-center">
          <span
            aria-hidden
            className={cn(
              "grid h-16 w-16 place-items-center rounded-full",
              added ? "animate-pop-in bg-success-soft text-success" : state.kind === "slow" ? "bg-warning-soft text-warning" : "bg-primary-soft",
            )}
          >
            {added ? (
              <Check className="h-8 w-8" strokeWidth={2.6} />
            ) : state.kind === "slow" ? (
              <Hourglass className="h-7 w-7" />
            ) : (
              <span className="h-7 w-7 animate-spin rounded-full border-[2.5px] border-primary/25 border-t-primary" />
            )}
          </span>
          <p role="status" className="mt-4 text-[15px] leading-relaxed text-text">
            {message}
          </p>
          {added && quota ? (
            <p className="mt-2 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent">
              {t("settings.creditsTotal", { count: quota.totalCredits })}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
