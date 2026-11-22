"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { BalanceCard } from "@/components/credits/BalanceCard";
import { CreditCosts } from "@/components/credits/CreditCosts";
import { GetTheAppCard } from "@/components/credits/GetTheAppCard";
import { PackList } from "@/components/credits/PackList";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { capturePaywallViewed } from "@/lib/analytics";
import { useWebSalesOn } from "@/lib/credits/salesSwitch";

/**
 * Credits (PIN-141): the balance, buying a pack, and what credits are for. Buying on the web skips the app stores'
 * cut, so the packs sit right under the balance, one click from Polar's checkout. Coming back from the checkout is
 * handled for every page by CheckoutReturnDialog.
 */
export function CreditsSettings() {
  const { t } = useTranslation();
  const salesOn = useWebSalesOn();

  // Once per visit, and only when the page offers packs (mobile counts its purchase sheet the same way).
  const counted = useRef(false);
  useEffect(() => {
    if (!salesOn || counted.current) return;
    counted.current = true;
    capturePaywallViewed("settings");
  }, [salesOn]);

  return (
    <>
      <SettingsPageHeader id="credits" />
      <div className="flex flex-col gap-7">
        <BalanceCard />

        <section aria-labelledby="credits-buy">
          <h2 id="credits-buy" className="text-[26px] leading-tight font-bold text-text">
            {t("credits.buyTitle")}
          </h2>
          <p className="mt-1.5 mb-4 text-[15px] leading-relaxed text-muted">{t("web.credits.buySubtitle")}</p>
          {salesOn ? <PackList variant="cards" /> : <GetTheAppCard />}
        </section>

        <CreditCosts />
      </div>
    </>
  );
}
