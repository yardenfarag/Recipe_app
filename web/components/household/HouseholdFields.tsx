"use client";

import { useTranslation } from "react-i18next";

import { HOUSEHOLD_AVATAR_IDS, householdAvatarDataUri, type HouseholdAvatarId } from "@shared/lib/householdAvatars";

import { ChoiceGroup } from "@/components/settings/controls";

/**
 * Choose the household's picture: the twelve household drawings as a radio group. Tab reaches the chosen one,
 * the arrow keys move between them in either writing direction, and each is read out by name.
 */
export function PicturePicker({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: HouseholdAvatarId;
  onChange: (id: HouseholdAvatarId) => void;
  label: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold text-text">{label}</legend>
      <ChoiceGroup
        label={label}
        value={value}
        onChange={onChange}
        trackId="household.picture"
        className="grid grid-cols-4 gap-2.5 @md:grid-cols-6 sm:gap-3"
        optionClassName="group relative aspect-square rounded-[26%] ring-offset-2 ring-offset-surface transition-transform motion-safe:hover:scale-105 data-[checked]:ring-[3px] data-[checked]:ring-primary disabled:opacity-60 motion-safe:disabled:hover:scale-100"
        options={HOUSEHOLD_AVATAR_IDS.map((id) => ({
          value: id,
          label: t(`household.avatars.${id}`),
          content: (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={householdAvatarDataUri(id)} alt="" className="h-full w-full" />
          ),
        }))}
      />
    </fieldset>
  );
}
