"use client";

import { CircleCheck, ShoppingCart, Users, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { goingShoppingAvailableAt, isShared, otherMembers } from "@shared/lib/household";
import { HouseholdError, sendGoingShopping } from "@shared/lib/supabase/household";
import { showToast } from "@shared/lib/toast";
import type { Household } from "@shared/types/household";

import { AvatarStack, HouseholdAvatar } from "@/components/household/HouseholdAvatar";
import { Button, buttonClasses } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Tile } from "@/components/ui/Tile";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { formatIn, householdErrorText, listNames } from "@/lib/household/householdText";
import { HOUSEHOLD_PROMO_DISMISSED_KEY, useLocalFlag } from "@/lib/household/localFlags";

/**
 * The top of the list when it is shared (ADR 034): whose list it is (the household's picture, the others' faces and
 * names, a way to the household's settings) and "I'm going shopping", which tells the others' phones so they can
 * add last-minute things. One compact tile, so the list itself stays the point.
 */
export function HouseholdStrip({ household }: { household: Household }) {
  const { t, i18n } = useTranslation();
  const others = otherMembers(household);
  const names = listNames(
    others.map((member) => member.displayName),
    i18n.language,
  );

  return (
    <Tile as="section" aria-label={household.name ?? t("household.title")} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3 sm:p-4">
      <Link
        href="/settings/household"
        data-track="shopping_list.household"
        className="-m-1 flex min-w-0 flex-1 basis-60 items-center gap-3 rounded-2xl p-1 transition-colors hover:bg-element"
      >
        <HouseholdAvatar value={household.avatar} className="h-11 w-11" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-base leading-snug font-bold text-text">
            <bdi>{household.name}</bdi>
          </span>
          <span className="block truncate text-sm text-muted">{t("household.live", { names })}</span>
        </span>
        <AvatarStack people={others} size="sm" max={4} className="shrink-0 max-[380px]:hidden" />
      </Link>
      <GoingShopping household={household} />
    </Tile>
  );
}

/** "I'm going shopping": once in 20 hours. After sending, says when it can be sent again instead of the button. */
export function GoingShopping({ household }: { household: Household }) {
  const { t, i18n } = useTranslation();
  const { patch, refresh } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const availableAt = goingShoppingAvailableAt(household.goingShoppingSentAt, now);

  // While it can't be sent, keep "in 5 hours" current and bring the button back when the time comes.
  useEffect(() => {
    if (!availableAt) return;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [availableAt]);

  async function send() {
    setBusy(true);
    try {
      const { notified, sentAt } = await sendGoingShopping();
      patch((current) => ({ ...current, goingShoppingSentAt: sentAt }));
      setNow(new Date());
      showToast(t("household.shopping.sent", { count: notified }));
    } catch (caught) {
      if (caught instanceof HouseholdError && caught.code === "already_sent_today") {
        showToast(t("household.shopping.alreadySent"), "info");
        void refresh();
      } else {
        showToast(householdErrorText(caught, t, "household.shopping.failed"), "error");
      }
    } finally {
      setBusy(false);
    }
  }

  if (availableAt) {
    return (
      <p role="status" className="flex min-h-10 items-center gap-2 text-sm font-semibold text-success max-sm:basis-full">
        <CircleCheck aria-hidden className="h-4 w-4 shrink-0" />
        {t("household.shopping.sentToday", { when: formatIn(availableAt, i18n.language, now) })}
      </p>
    );
  }

  return (
    <Tooltip label={t("household.shopping.hint")}>
      <Button variant="secondary" size="sm" busy={busy} trackId="shopping_list.going_shopping" onClick={() => void send()} className="max-sm:w-full">
        {busy ? null : <ShoppingCart aria-hidden className="h-4 w-4 rtl:-scale-x-100" />}
        {busy ? t("household.shopping.sending") : t("household.shopping.button")}
      </Button>
    </Tooltip>
  );
}

/**
 * "Shop together": on the list while nobody else shares it, a card that leads to setting up a household. "Not now"
 * hides it in this browser for good; Settings › Household is always there.
 */
export function ShopTogetherCard({ household, className }: { household: Household | null; className?: string }) {
  const { t } = useTranslation();
  const [dismissed, dismiss] = useLocalFlag(HOUSEHOLD_PROMO_DISMISSED_KEY);
  if (!household || isShared(household) || dismissed) return null;
  return (
    <Tile as="aside" aria-labelledby="shop-together-title" className={cn("relative flex flex-col gap-3 p-4 pe-14 sm:flex-row sm:items-center sm:gap-4 sm:p-5 sm:pe-14", className)}>
      <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-text">
        <Users className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="shop-together-title" className="text-base font-bold text-text">
          {t("household.promo.title")}
        </h2>
        <p className="mt-0.5 text-sm leading-relaxed text-pretty text-muted">{t("household.promo.body")}</p>
      </div>
      <Link href="/settings/household" data-track="shopping_list.household_promo" className={buttonClasses({ variant: "secondary", size: "sm", className: "self-start sm:self-center" })}>
        {household.isSetUp ? t("household.manage.invite") : t("household.promo.button")}
      </Link>
      <IconButton
        label={t("household.promo.dismiss")}
        trackId="shopping_list.household_promo.dismiss"
        icon={<X className="h-4 w-4" />}
        onClick={dismiss}
        className="absolute end-2 top-2 h-10 w-10 pointer-coarse:h-11 pointer-coarse:w-11"
      />
    </Tile>
  );
}
