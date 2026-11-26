"use client";

import { BookHeart, Refrigerator, Repeat, ShoppingBasket } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { suggestDisplayName } from "@shared/lib/household";
import { householdAvatarValue, suggestHouseholdAvatar, type HouseholdAvatarId } from "@shared/lib/householdAvatars";
import { setUpHousehold } from "@shared/lib/supabase/household";
import { showToast } from "@shared/lib/toast";
import { HOUSEHOLD_DISPLAY_NAME_MAX, HOUSEHOLD_NAME_MAX, type Household } from "@shared/types/household";

import { useAuth } from "@/components/AuthProvider";
import { PicturePicker } from "@/components/household/HouseholdFields";
import { ErrorAlert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Tile } from "@/components/ui/Tile";
import { householdErrorText } from "@/lib/household/householdText";

/** The name a person's account suggests for them in the household: their own name, else their email's start. */
export function useSuggestedDisplayName(): string {
  const { user } = useAuth();
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
  return suggestDisplayName({ fullName: meta.full_name ?? meta.name ?? null, email: user?.email ?? null });
}

/** What a household shares and what stays each person's own, as a short list. */
export function WhatYouShare() {
  const { t } = useTranslation();
  const row = (icon: ReactNode, text: string) => (
    <li className="flex items-center gap-3">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-text [&_svg]:h-[18px] [&_svg]:w-[18px]">
        {icon}
      </span>
      <span className="text-[15px] font-semibold text-text">{text}</span>
    </li>
  );
  return (
    <div>
      <h3 className="mb-3 text-base font-bold text-text">{t("household.shares.title")}</h3>
      <ul className="flex flex-col gap-2.5">
        {row(<ShoppingBasket />, t("household.shares.list"))}
        {row(<Refrigerator />, t("household.shares.pantry"))}
        {row(<Repeat />, t("household.shares.staples"))}
      </ul>
      <p className="mt-4 flex items-center gap-3 text-sm text-muted">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-element text-muted">
          <BookHeart className="h-[18px] w-[18px]" />
        </span>
        {t("household.shares.personal")}
      </p>
    </div>
  );
}

/**
 * Settings › Household before it is set up: what sharing means, then a name, a picture and the name the others
 * will see. Creating it goes straight on to inviting people (`onCreated`).
 */
export function SetupHousehold({ household, onCreated }: { household: Household; onCreated: (household: Household) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const suggested = useSuggestedDisplayName();
  const [name, setName] = useState("");
  const [picture, setPicture] = useState<HouseholdAvatarId>(() => suggestHouseholdAvatar(user?.id ?? household.id));
  const [displayName, setDisplayName] = useState(suggested);
  const [errors, setErrors] = useState<{ name?: string; displayName?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const displayNameRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = {
      name: name.trim() ? undefined : t("household.setup.nameRequired"),
      displayName: displayName.trim() ? undefined : t("household.setup.yourNameRequired"),
    };
    setErrors(next);
    setFailure(null);
    if (next.name) return nameRef.current?.focus();
    if (next.displayName) return displayNameRef.current?.focus();
    setBusy(true);
    try {
      const created = await setUpHousehold({ name: name.trim(), avatar: householdAvatarValue(picture), displayName: displayName.trim() });
      showToast(t("household.setup.created", { name: created.name ?? name.trim() }));
      onCreated(created);
    } catch (caught) {
      setFailure(householdErrorText(caught, t));
      setBusy(false);
    }
  }

  return (
    <Tile as="section" aria-labelledby="household-setup-title" className="p-5 sm:p-6">
      <div className="grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_16rem]">
        <form onSubmit={(event) => void submit(event)} noValidate className="flex min-w-0 flex-col gap-5">
          <div>
            <h2 id="household-setup-title" className="text-xl font-bold text-text">
              {t("household.setup.title")}
            </h2>
            <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-pretty text-muted">{t("household.setup.intro")}</p>
          </div>
          <TextField
            ref={nameRef}
            label={t("household.setup.nameLabel")}
            placeholder={t("household.setup.namePlaceholder")}
            value={name}
            maxLength={HOUSEHOLD_NAME_MAX}
            autoComplete="off"
            error={errors.name}
            disabled={busy}
            onChange={(event) => {
              setName(event.target.value);
              if (errors.name) setErrors((current) => ({ ...current, name: undefined }));
            }}
          />
          <PicturePicker label={t("household.setup.avatarLabel")} value={picture} onChange={setPicture} disabled={busy} />
          <TextField
            label={t("household.setup.yourNameLabel")}
            hint={t("household.setup.yourNameHint")}
            value={displayName}
            maxLength={HOUSEHOLD_DISPLAY_NAME_MAX}
            autoComplete="given-name"
            error={errors.displayName}
            disabled={busy}
            onChange={(event) => {
              setDisplayName(event.target.value);
              if (errors.displayName) setErrors((current) => ({ ...current, displayName: undefined }));
            }}
            ref={displayNameRef}
          />
          {failure ? <ErrorAlert>{failure}</ErrorAlert> : null}
          <div>
            <Button type="submit" size="lg" busy={busy} trackId="household.setup.create" className="max-sm:w-full">
              {busy ? t("household.setup.creating") : t("household.setup.create")}
            </Button>
          </div>
        </form>
        <aside className="rounded-3xl bg-element p-5 @3xl:self-start">
          <WhatYouShare />
        </aside>
      </div>
    </Tile>
  );
}
