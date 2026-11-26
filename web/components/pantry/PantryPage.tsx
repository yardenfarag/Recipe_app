"use client";

import { Camera, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { otherMembers } from "@shared/lib/household";
import { daysSince, lastScannedByPlace, PANTRY_STALE_DAYS } from "@shared/lib/pantry";
import { showToast } from "@shared/lib/toast";
import { PANTRY_PLACES, type PantryItem, type PantryPlace } from "@shared/types/pantry";

import { AvatarStack } from "@/components/household/HouseholdAvatar";
import { PLACE_ICONS, whenText } from "@/components/pantry/places";
import { StaplesCard } from "@/components/pantry/StaplesCard";
import { AddItemField, RemovableChip } from "@/components/settings/controls";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { Tile } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { listNames } from "@/lib/household/householdText";
import { usePantry } from "@/lib/pantry/usePantry";

type Undo = { message: string; run: () => Promise<unknown> };

/**
 * Settings › Pantry (PIN-181): everything at home, by place, with when each place was last scanned. Scanning is the
 * main way in; typing an item, removing one and "Always have" staples are here too. Changes save at once.
 */
export function PantryPage() {
  const { t, i18n } = useTranslation();
  const pantry = usePantry();
  const [undo, setUndo] = useState<Undo | null>(null);
  const items = pantry.items;

  const byPlace = useMemo(() => {
    const groups = new Map<PantryPlace, PantryItem[]>(PANTRY_PLACES.map((place) => [place, []]));
    for (const item of items ?? []) groups.get(item.place)?.push(item);
    for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name, i18n.language));
    return groups;
  }, [items, i18n.language]);
  const scanned = useMemo(() => lastScannedByPlace(items ?? []), [items]);
  const latest = Object.values(scanned).sort().at(-1) ?? null;
  const stale = (daysSince(latest) ?? 0) >= PANTRY_STALE_DAYS;

  function remove(item: PantryItem) {
    pantry
      .remove([item.id])
      .then(() =>
        setUndo({
          message: t("pantry.removed", { name: item.name }),
          run: () => pantry.add([{ name: item.name, nameEn: item.nameEn, brand: item.brand, place: item.place, aisle: item.aisle, source: item.source }]),
        }),
      )
      .catch(() => showToast(t("pantry.saveFailed"), "error"));
  }

  async function addTyped(place: PantryPlace, name: string) {
    try {
      await pantry.add([{ name, place, source: "manual" }]);
      setUndo(null);
      return true;
    } catch {
      showToast(t("pantry.saveFailed"), "error");
      return false;
    }
  }

  const scanLink = (
    <Link href="/pantry/scan" data-track="pantry.scan" className={buttonClasses({ variant: "primary" })}>
      <Camera aria-hidden className="h-[18px] w-[18px]" />
      {items && items.length > 0 ? t("pantry.scanAgain") : t("pantry.scanKitchen")}
    </Link>
  );

  return (
    <>
      <SettingsPageHeader id="pantry" actions={items && items.length > 0 ? scanLink : undefined} />
      <div className="flex flex-col gap-4">
        <SharedWith />
        {pantry.failed ? (
          <ErrorState body={t("pantry.loadFailed")} trackId="pantry.load_error" onRetry={() => void pantry.reload()} />
        ) : !items ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <Tile>
            <EmptyState icon={<Camera aria-hidden />} title={t("pantry.emptyTitle")} body={t("pantry.emptyBody")} action={scanLink} />
          </Tile>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted">
              <span className="font-semibold text-text">{t("pantry.count", { count: items.length })}</span>
              {latest ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{t("pantry.scannedWhen", { when: whenText(latest, t) })}</span>
                </>
              ) : null}
            </p>
            {stale ? (
              <p role="status" className="rounded-2xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
                {t("pantry.stale")}
              </p>
            ) : null}
            {undo ? (
              <div role="status" className="flex items-center gap-3 rounded-2xl bg-element px-4 py-2.5 text-sm text-text">
                <span className="min-w-0 flex-1">
                  <bdi>{undo.message}</bdi>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  trackId="pantry.undo_remove"
                  onClick={() => {
                    const run = undo.run;
                    setUndo(null);
                    run().catch(() => showToast(t("pantry.saveFailed"), "error"));
                  }}
                >
                  <RotateCcw aria-hidden className="h-4 w-4" />
                  {t("pantry.undo")}
                </Button>
              </div>
            ) : null}
            <div className="grid gap-4 @3xl:grid-cols-2">
              {PANTRY_PLACES.map((place) => (
                <PlaceCard
                  key={place}
                  place={place}
                  items={byPlace.get(place) ?? []}
                  scannedAt={scanned[place] ?? null}
                  onRemove={remove}
                  onAdd={(name) => addTyped(place, name)}
                />
              ))}
            </div>
          </>
        )}
        <StaplesCard />
      </div>
    </>
  );
}

/** "Shared with Dana and Avi" when someone else lives here too (ADR 034): their changes show here as they happen. */
function SharedWith() {
  const { t, i18n } = useTranslation();
  const { household } = useHousehold();
  const others = otherMembers(household);
  if (others.length === 0) return null;
  return (
    <Link
      href="/settings/household"
      data-track="pantry.household"
      className="flex w-fit max-w-full items-center gap-2.5 rounded-full border border-border bg-surface py-1.5 ps-1.5 pe-4 text-sm font-semibold text-text transition-colors hover:bg-element"
    >
      <AvatarStack people={others} size="sm" max={3} />
      <span className="min-w-0 truncate">{t("household.live", { names: listNames(others.map((member) => member.displayName), i18n.language) })}</span>
    </Link>
  );
}

function PlaceCard({
  place,
  items,
  scannedAt,
  onRemove,
  onAdd,
}: {
  place: PantryPlace;
  items: PantryItem[];
  scannedAt: string | null;
  onRemove: (item: PantryItem) => void;
  onAdd: (name: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const Icon = PLACE_ICONS[place];
  const placeName = t(`pantry.places.${place}`);
  const when = whenText(scannedAt, t);

  return (
    <Tile as="section" aria-label={placeName} className="flex flex-col p-5">
      <header className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-text">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-text">{placeName}</h2>
          <p className="text-sm text-muted">
            {items.length > 0 ? t("pantry.scan.items", { count: items.length }) : t("pantry.emptyPlace")}
            {when ? ` · ${t("pantry.scannedWhen", { when })}` : null}
          </p>
        </div>
        <Link
          href={`/pantry/scan?place=${place}`}
          data-track={`pantry.scan_place.${place}`}
          aria-label={t("pantry.scanPlace", { place: placeName })}
          className={buttonClasses({ variant: "ghost", size: "sm", className: "shrink-0" })}
        >
          <Camera aria-hidden className="h-4 w-4" />
          <span className="hidden @sm:inline">{t("pantry.scanAgain")}</span>
        </Link>
      </header>

      {items.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.id} className="max-w-full" title={item.brand || undefined}>
              <RemovableChip label={item.name} onRemove={() => onRemove(item)} trackId="pantry.item.remove" />
            </li>
          ))}
        </ul>
      ) : null}

      <div className={cn("mt-4", items.length === 0 && "mt-3")}>
        {adding ? (
          <AddItemField
            label={t("pantry.addPlaceholder")}
            value={draft}
            onChange={setDraft}
            onAdd={() => {
              const name = draft.trim();
              if (!name) return;
              void onAdd(name).then((ok) => {
                if (ok) setDraft("");
              });
            }}
            maxLength={60}
            addLabel={t("pantry.addTo", { place: placeName })}
            trackId={`pantry.add.${place}`}
          />
        ) : (
          <Button variant="ghost" size="sm" trackId={`pantry.add_open.${place}`} onClick={() => setAdding(true)} className="-ms-2">
            <Plus aria-hidden className="h-4 w-4" />
            {t("pantry.addItem")}
          </Button>
        )}
      </div>
    </Tile>
  );
}
