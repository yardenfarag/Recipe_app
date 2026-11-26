"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { MAX_PANTRY_STAPLES } from "@shared/lib/kitchenProfile";
import { showToast } from "@shared/lib/toast";

import { AddItemField, RemovableChip, SettingsCard } from "@/components/settings/controls";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { usePantryStaples } from "@/lib/list/usePantryStaples";

/**
 * "Always have": staples that never run out (salt, oil), which stay off the shopping list. Since ADR 034 they
 * belong to the household, so everyone who shares the list keeps one "Always have" list. Changes show at once.
 */
export function StaplesCard() {
  const { t } = useTranslation();
  const { alwaysHave, failed, retry, keepStaple, dropStaple } = usePantryStaples();
  const [draft, setDraft] = useState("");
  const onError = () => showToast(t("settings.kitchenSaveFailed"), "error");

  return (
    <SettingsCard title={t("pantry.alwaysHave")} hint={t("pantry.alwaysHaveHint")}>
      {failed && !alwaysHave?.length ? (
        <ErrorState body={t("common.tryAgain")} trackId="pantry.staples.load_error" onRetry={() => void retry()} />
      ) : !alwaysHave ? (
        <LoadingState />
      ) : (
        <>
          {alwaysHave.length === 0 ? (
            <p className="mb-3 text-sm text-muted">{t("settings.kitchenPantryEmpty")}</p>
          ) : (
            <div className="mb-3 flex flex-wrap gap-2">
              {alwaysHave.map((staple) => (
                <RemovableChip key={staple} label={staple} onRemove={() => void dropStaple(staple).catch(onError)} trackId="pantry.staples.remove" />
              ))}
            </div>
          )}
          {alwaysHave.length >= MAX_PANTRY_STAPLES ? (
            <p className="text-sm text-muted">{t("avoid.limit", { count: MAX_PANTRY_STAPLES })}</p>
          ) : (
            <AddItemField
              label={t("settings.kitchenPantryPlaceholder")}
              value={draft}
              onChange={setDraft}
              onAdd={() => {
                const name = draft.trim();
                if (!name) return;
                setDraft("");
                // A name already on the list is left as it is (keepStaple ignores it).
                void keepStaple(name).catch(onError);
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
