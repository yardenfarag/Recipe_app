"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { MAX_PANTRY_STAPLES, addPantryStaple, removePantryStaple } from "@shared/lib/kitchenProfile";

import { AddItemField, RemovableChip, SettingsCard } from "@/components/settings/controls";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { useKitchenSettings } from "@/lib/settings/useKitchenSettings";

/**
 * "Always have": staples that never run out (salt, oil), which stay off the shopping list. They are still stored
 * in the kitchen profile, as before PIN-181, so the mobile app's older builds keep reading them; they just live on
 * the Pantry page now, next to everything else that's at home.
 */
export function StaplesCard() {
  const { t } = useTranslation();
  const kitchen = useKitchenSettings();
  const [draft, setDraft] = useState("");
  const profile = kitchen.profile;

  return (
    <SettingsCard title={t("pantry.alwaysHave")} hint={t("pantry.alwaysHaveHint")}>
      {kitchen.loadFailed ? (
        <ErrorState body={t("common.tryAgain")} trackId="pantry.staples.load_error" onRetry={() => void kitchen.retry()} />
      ) : !profile ? (
        <LoadingState />
      ) : (
        <>
          {profile.pantryStaples.length === 0 ? (
            <p className="mb-3 text-sm text-muted">{t("settings.kitchenPantryEmpty")}</p>
          ) : (
            <div className="mb-3 flex flex-wrap gap-2">
              {profile.pantryStaples.map((staple) => (
                <RemovableChip
                  key={staple}
                  label={staple}
                  onRemove={() => kitchen.save(removePantryStaple(profile, staple))}
                  trackId="pantry.staples.remove"
                />
              ))}
            </div>
          )}
          {profile.pantryStaples.length >= MAX_PANTRY_STAPLES ? (
            <p className="text-sm text-muted">{t("avoid.limit", { count: MAX_PANTRY_STAPLES })}</p>
          ) : (
            <AddItemField
              label={t("settings.kitchenPantryPlaceholder")}
              value={draft}
              onChange={setDraft}
              onAdd={() => {
                const next = addPantryStaple(profile, draft);
                if (next === profile) return;
                setDraft("");
                kitchen.save(next);
              }}
              maxLength={60}
              addLabel={t("settings.kitchenPantryAdd")}
              trackId="pantry.staples.add"
            />
          )}
        </>
      )}
    </SettingsCard>
  );
}
