"use client";

import { Check, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { applianceNameKey } from "@shared/lib/applianceDisplay";
import type { ApplianceKey } from "@shared/lib/appliances";
import { APPLIANCE_CHECKLIST, specialOwnedCount, tickedAppliances, toggleAppliance } from "@shared/lib/ownedAppliances";

import { ApplianceIcon } from "@/components/recipe/RecipeAppliancesSection";
import { SettingsCard, SubHeading } from "@/components/settings/controls";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { ownedAppliances, useOwnedAppliances } from "@/lib/settings/ownedAppliances";

/** The id the recipe page links to ("Tell Pinch what's in your kitchen"). */
export const APPLIANCES_SECTION_ID = "appliances";

/**
 * "My appliances" (PIN-155): tick what's in the kitchen, and recipes that need something else say so. Saved on the
 * account at every tap, like the rest of this page, so the phone shows the same list.
 *
 * Until the first tick the list is "not set" and recipes check nothing, as before. The basics (stovetop, oven,
 * microwave) start ticked; "I have none of these" saves the list as it stands, for a kitchen with nothing special.
 */
export function AppliancesSettings() {
  const { t } = useTranslation();
  const { kitchen, userId } = useOwnedAppliances();
  const [confirmClear, setConfirmClear] = useState(false);
  const ticked = tickedAppliances(kitchen);
  const count = specialOwnedCount(kitchen);

  // Opening Settings is when a list ticked on the phone matters most: read the account again.
  useEffect(() => {
    ownedAppliances().refresh({ force: true });
  }, [userId]);

  // Arriving from a recipe's "Tell Pinch what's in your kitchen": bring this card into view.
  useEffect(() => {
    if (window.location.hash === `#${APPLIANCES_SECTION_ID}`) {
      document.getElementById(APPLIANCES_SECTION_ID)?.scrollIntoView({ block: "start" });
    }
  }, []);

  const toggle = (key: ApplianceKey) => ownedAppliances().save(toggleAppliance(kitchen, key));

  return (
    <div id={APPLIANCES_SECTION_ID} className="scroll-mt-24">
      <SettingsCard title={t("myAppliances.title")} hint={t("myAppliances.hint")}>
        {kitchen ? (
          <div data-testid="appliances-status" className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-text">
              <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-success-soft text-success">
                <Check className="h-3.5 w-3.5" />
              </span>
              {t("myAppliances.checking", { count })}
            </p>
            <Button variant="link" onClick={() => setConfirmClear(true)} trackId="settings.appliances.clear">
              {t("myAppliances.stopChecking")}
            </Button>
          </div>
        ) : (
          <div data-testid="appliances-status" className="mb-5 flex flex-col gap-3 rounded-2xl bg-surface-soft px-4 py-3.5 sm:flex-row sm:items-center">
            <p className="flex min-w-0 flex-1 items-start gap-2.5 text-sm leading-relaxed text-muted">
              <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {t("myAppliances.notSet")}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="self-start sm:self-auto"
              onClick={() => ownedAppliances().save([...ticked])}
              trackId="settings.appliances.none"
            >
              {t("myAppliances.noneOfThese")}
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-5">
          {APPLIANCE_CHECKLIST.map((group) => {
            // The catalog keeps these under one dotted key, "myAppliances.groups", which the default "." separator
            // can't reach; ">" splits the path at the right place.
            const label = t(`myAppliances.groups>${group.id}`, { keySeparator: ">" });
            return (
              <div key={group.id}>
                <SubHeading>{label}</SubHeading>
                {group.id === "basics" ? <p className="-mt-1 mb-2.5 text-sm text-muted">{t("myAppliances.basicsHint")}</p> : null}
                <div role="group" aria-label={label} className="flex flex-wrap gap-2">
                  {group.keys.map((key) => (
                    <ApplianceToggle key={key} appliance={key} pressed={ticked.has(key)} onToggle={() => toggle(key)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </SettingsCard>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t("myAppliances.clearTitle")}
        description={t("myAppliances.clearBody")}
        confirmLabel={t("myAppliances.clearConfirm")}
        trackId="settings.appliances.clear_dialog"
        confirmVariant="primary"
        onConfirm={() => ownedAppliances().clear()}
      />
    </div>
  );
}

/** One appliance, on or off. The icon stays, so the list is quick to scan; a tick shows it's in the kitchen. */
function ApplianceToggle({ appliance, pressed, onToggle }: { appliance: ApplianceKey; pressed: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      data-track={`settings.appliances.toggle.${appliance}`}
      data-testid={`my-appliance-${appliance}`}
      className={cn(
        "inline-flex min-h-11 shrink-0 select-none items-center gap-2 rounded-full border ps-3 pe-3.5 text-sm font-semibold transition-colors active:scale-[0.98]",
        pressed ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-text hover:bg-element",
      )}
    >
      <ApplianceIcon appliance={appliance} className={cn("h-[18px] w-[18px]", pressed ? "text-primary" : "text-muted")} />
      {t(applianceNameKey(appliance))}
      <span
        aria-hidden
        className={cn(
          "grid h-5 w-5 place-items-center rounded-full transition-colors",
          pressed ? "bg-primary text-on-primary" : "border border-border",
        )}
      >
        {pressed ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}
