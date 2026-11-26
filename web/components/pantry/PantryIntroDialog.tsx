"use client";

import { Camera, Refrigerator } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";

/**
 * Asked once, right after a new account's first-run questions (PIN-181): fill the pantry now from a few photos, or
 * later from Settings. Closing it counts as Later.
 */
export function PantryIntroDialog({ open, onNow, onLater }: { open: boolean; onNow: () => void; onLater: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onLater()}>
      {open ? (
        <DialogContent
          title={t("pantry.intro.title")}
          description={t("pantry.intro.body")}
          footer={
            <>
              <Button variant="ghost" trackId="onboarding.pantry.later" onClick={onLater}>
                {t("pantry.intro.later")}
              </Button>
              <Button trackId="onboarding.pantry.now" onClick={onNow}>
                <Camera aria-hidden className="h-[18px] w-[18px]" />
                {t("pantry.intro.now")}
              </Button>
            </>
          }
        >
          <div className="flex items-center gap-4 rounded-2xl bg-primary-soft p-4">
            <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface text-primary-text">
              <Refrigerator className="h-6 w-6" />
            </span>
            <p className="text-sm leading-relaxed text-text">{t("pantry.intro.laterHint")}</p>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
