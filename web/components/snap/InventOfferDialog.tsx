"use client";

import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import type { InventOffer } from "@/lib/snap/useSnap";

/**
 * No written recipe, but a dish: "Guess the recipe?" with what it looks like and what it costs. When it may still
 * be a recipe, Extract anyway is offered too.
 */
export function InventOfferDialog({
  offer,
  onAccept,
  onExtractAnyway,
  onClose,
}: {
  offer: InventOffer | null;
  onAccept: () => void;
  onExtractAnyway: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dish = offer?.dishGuess?.trim();
  return (
    <Dialog open={offer != null} onOpenChange={(open) => !open && onClose()}>
      {offer ? (
        <DialogContent
          title={t("snap.inventConfirmTitle")}
          description={dish ? t("snap.inventConfirmBody", { dish }) : t("snap.inventConfirmBodyGeneric")}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost" trackId="snap.invent_offer_dialog.cancel">{t("common.cancel")}</Button>
              </DialogClose>
              {offer.allowExtract ? (
                <Button variant="outline" trackId="snap.invent_offer_dialog.secondary" onClick={onExtractAnyway}>
                  {t("snap.extractAnyway")}
                </Button>
              ) : null}
              <Button trackId="snap.invent_offer_dialog.confirm" onClick={onAccept}>{t("snap.inventConfirm")}</Button>
            </>
          }
        />
      ) : null}
    </Dialog>
  );
}
