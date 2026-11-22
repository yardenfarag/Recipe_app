"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ALLERGEN_KEYS,
  DISLIKE_SUGGESTION_KEYS,
  MAX_AVOID_ITEM_CHARS,
  MAX_DISLIKES,
  MAX_OTHER_ALLERGIES,
  cleanAvoidItem,
  dislikeSuggestionFor,
  hasAllergies,
  normalizeFoodText,
  type AllergenKey,
  type DislikeSuggestionKey,
} from "@shared/lib/avoidList";
import type { KitchenProfile } from "@shared/lib/kitchenProfile";

import { AddItemField, RemovableChip, SettingsCard, ToggleChip } from "@/components/settings/controls";
import { ConfirmDialog } from "@/components/ui/Dialog";

const sameItem = (a: string, b: string) => normalizeFoodText(a) === normalizeFoodText(b);

/**
 * Allergies and foods the cook doesn't like (PIN-105), the same rules as the mobile app's editor
 * (src/components/AvoidListEditor.tsx). Adding the first allergy asks the cook to confirm a short notice; after that
 * the reminder stays under the list. Removing never asks.
 */
export function AvoidListEditor({
  profile,
  onChange,
  trackPrefix = "settings.kitchen",
}: {
  profile: KitchenProfile;
  onChange: (next: KitchenProfile) => void;
  /** Starts the activity-log ids of its buttons, as on mobile ("settings.kitchen", "onboarding.avoid"). */
  trackPrefix?: string;
}) {
  const { t } = useTranslation();
  const [allergyDraft, setAllergyDraft] = useState("");
  const [dislikeDraft, setDislikeDraft] = useState("");
  /** The allergy waiting for the cook to confirm the notice. */
  const [pending, setPending] = useState<{ next: KitchenProfile; clearDraft: boolean } | null>(null);

  const customDislikes = profile.dislikes.filter((item) => dislikeSuggestionFor(item) == null);
  const otherFull = profile.otherAllergies.length >= MAX_OTHER_ALLERGIES;
  const dislikesFull = profile.dislikes.length >= MAX_DISLIKES;

  function saveAllergies(next: KitchenProfile, clearDraft = false) {
    if (!profile.allergyNoticeAcceptedAt) {
      setPending({ next, clearDraft });
      return;
    }
    onChange(next);
    if (clearDraft) setAllergyDraft("");
  }

  function acceptNotice() {
    if (!pending) return;
    onChange({ ...pending.next, allergyNoticeAcceptedAt: new Date().toISOString() });
    if (pending.clearDraft) setAllergyDraft("");
    setPending(null);
  }

  function toggleAllergen(key: AllergenKey) {
    if (profile.allergies.includes(key)) {
      onChange({ ...profile, allergies: profile.allergies.filter((item) => item !== key) });
      return;
    }
    saveAllergies({ ...profile, allergies: ALLERGEN_KEYS.filter((item) => item === key || profile.allergies.includes(item)) });
  }

  function addOtherAllergy() {
    const item = cleanAvoidItem(allergyDraft);
    if (!item || otherFull) return;
    if (profile.otherAllergies.some((existing) => sameItem(existing, item))) {
      setAllergyDraft("");
      return;
    }
    saveAllergies({ ...profile, otherAllergies: [...profile.otherAllergies, item] }, true);
  }

  function toggleSuggestion(key: DislikeSuggestionKey) {
    const active = profile.dislikes.some((item) => dislikeSuggestionFor(item) === key);
    if (active) {
      onChange({ ...profile, dislikes: profile.dislikes.filter((item) => dislikeSuggestionFor(item) !== key) });
      return;
    }
    if (dislikesFull) return;
    onChange({ ...profile, dislikes: [...profile.dislikes, t(`avoid.suggestions.${key}`)] });
  }

  function addDislike() {
    const item = cleanAvoidItem(dislikeDraft);
    if (!item || dislikesFull) return;
    setDislikeDraft("");
    if (profile.dislikes.some((existing) => sameItem(existing, item))) return;
    onChange({ ...profile, dislikes: [...profile.dislikes, item] });
  }

  return (
    <>
      <SettingsCard title={t("avoid.allergiesTitle")} hint={t("avoid.allergiesHint")}>
        <div role="group" aria-label={t("avoid.allergiesTitle")} className="flex flex-wrap gap-2">
          {ALLERGEN_KEYS.map((key) => (
            <ToggleChip key={key} pressed={profile.allergies.includes(key)} onToggle={() => toggleAllergen(key)} trackId={`${trackPrefix}.allergy.toggle`}>
              {t(`avoid.allergens.${key}`)}
            </ToggleChip>
          ))}
          {profile.otherAllergies.map((item) => (
            <RemovableChip
              key={item}
              label={item}
              trackId={`${trackPrefix}.allergy.remove`}
              onRemove={() => onChange({ ...profile, otherAllergies: profile.otherAllergies.filter((existing) => existing !== item) })}
            />
          ))}
        </div>
        <div className="mt-3">
          {otherFull ? (
            <p className="text-sm text-muted">{t("avoid.limit", { count: MAX_OTHER_ALLERGIES })}</p>
          ) : (
            <AddItemField
              label={t("avoid.otherAllergyPlaceholder")}
              value={allergyDraft}
              onChange={setAllergyDraft}
              onAdd={addOtherAllergy}
              trackId={`${trackPrefix}.allergy.add`}
              maxLength={MAX_AVOID_ITEM_CHARS}
            />
          )}
        </div>
        {hasAllergies(profile) ? (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm leading-relaxed text-warning">
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {t("avoid.checkLabels")}
          </p>
        ) : null}
      </SettingsCard>

      <SettingsCard title={t("avoid.dislikesTitle")} hint={t("avoid.dislikesHint")}>
        <div role="group" aria-label={t("avoid.dislikesTitle")} className="flex flex-wrap gap-2">
          {DISLIKE_SUGGESTION_KEYS.map((key) => {
            const active = profile.dislikes.some((item) => dislikeSuggestionFor(item) === key);
            return (
              <ToggleChip key={key} pressed={active} disabled={dislikesFull && !active} onToggle={() => toggleSuggestion(key)} trackId={`${trackPrefix}.dislike.toggle`}>
                {t(`avoid.suggestions.${key}`)}
              </ToggleChip>
            );
          })}
          {customDislikes.map((item) => (
            <RemovableChip
              key={item}
              label={item}
              trackId={`${trackPrefix}.dislike.remove`}
              onRemove={() => onChange({ ...profile, dislikes: profile.dislikes.filter((existing) => existing !== item) })}
            />
          ))}
        </div>
        <div className="mt-3">
          {dislikesFull ? (
            <p className="text-sm text-muted">{t("avoid.limit", { count: MAX_DISLIKES })}</p>
          ) : (
            <AddItemField
              label={t("avoid.dislikePlaceholder")}
              value={dislikeDraft}
              onChange={setDislikeDraft}
              onAdd={addDislike}
              trackId={`${trackPrefix}.dislike.add`}
              maxLength={MAX_AVOID_ITEM_CHARS}
            />
          )}
        </div>
      </SettingsCard>

      <ConfirmDialog
        open={pending != null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={t("avoid.noticeTitle")}
        description={t("avoid.noticeBody")}
        confirmLabel={t("avoid.noticeConfirm")}
        trackId={`${trackPrefix}.allergy_notice_dialog`}
        confirmVariant="primary"
        onConfirm={acceptNotice}
      />
    </>
  );
}
