"use client";

import { Check, Info, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { groupByPlaceAndAisle, mergeScanPhotos, notSeenInScan, pantryNameKey } from "@shared/lib/pantry";
import type { NewPantryItem } from "@shared/lib/supabase/pantry";
import { PANTRY_PLACES, type PantryItem, type PantryPlace, type ReviewItem, type ScanPhoto } from "@shared/types/pantry";

import { PLACE_ICONS } from "@/components/pantry/places";
import { AddItemField, inputClass } from "@/components/settings/controls";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Tile, TileLabel } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";

type Row = ReviewItem & { ticked: boolean; edited: boolean };

/**
 * Step two of a scan: one list for every photo. What Pinch wasn't sure of comes first and unticked, then the rest by
 * place and aisle, ticked. Every name can be changed, anything missed can be added, and saved items the photos no
 * longer showed are listed to tick off (a rescan never removes anything by itself).
 */
export function ScanReview({
  photos,
  saved,
  onBack,
  onSave,
}: {
  photos: ScanPhoto[];
  /** The pantry as saved before this scan; null when it couldn't be read (then nothing is offered for removal). */
  saved: PantryItem[] | null;
  onBack: () => void;
  onSave: (keep: NewPantryItem[], removeIds: string[]) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<Row[]>(() => mergeScanPhotos(photos).map((item) => ({ ...item, ticked: item.sure, edited: false })));
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const scannedPlaces = useMemo(() => [...new Set(photos.map((photo) => photo.place))], [photos]);
  const notSeen = useMemo(() => (saved ? notSeenInScan(saved, rows, scannedPlaces) : []), [saved, rows, scannedPlaces]);

  const unsure = rows.filter((row) => !row.sure && !row.manual);
  const groups = groupByPlaceAndAisle(
    rows.filter((row) => row.sure || row.manual),
    i18n.language,
  );
  const shownPlaces = PANTRY_PLACES.filter((place) => scannedPlaces.includes(place) || groups.some((group) => group.place === place));
  const tickedCount = rows.filter((row) => row.ticked && row.name.trim()).length;

  const toggle = (key: string) => setRows((list) => list.map((row) => (row.key === key ? { ...row, ticked: !row.ticked } : row)));
  const rename = (key: string, name: string) =>
    setRows((list) => list.map((row) => (row.key === key ? { ...row, name, edited: true, ticked: name.trim() ? true : row.ticked } : row)));

  function addManual(place: PantryPlace, name: string) {
    const key = `${place}|${pantryNameKey(name)}`;
    setRows((list) => {
      const existing = list.find((row) => row.key === key);
      if (existing) return list.map((row) => (row.key === key ? { ...row, ticked: true } : row));
      return [...list, { key, name, nameEn: "", brand: "", place, aisle: "other", sure: true, containerUnknown: false, manual: true, ticked: true, edited: true }];
    });
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(
        rows
          .filter((row) => row.ticked && row.name.trim())
          .map((row) => ({
            name: row.name.trim(),
            // A changed name no longer is what the English name described.
            nameEn: row.edited || row.containerUnknown ? "" : row.nameEn,
            brand: row.brand,
            place: row.place,
            aisle: row.aisle,
            source: "scan" as const,
          })),
        notSeen.filter((item) => gone.has(item.id)).map((item) => item.id),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <p className="flex items-start gap-3 rounded-2xl bg-primary-soft px-4 py-3.5 text-[15px] leading-relaxed text-text">
        <Info aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary-text" />
        <span>{t("pantry.review.disclaimer")}</span>
      </p>

      {unsure.length > 0 ? (
        <Tile as="section" aria-labelledby="pantry-unsure" className="p-5">
          <h2 id="pantry-unsure" className="text-lg font-bold text-text">
            {t("pantry.review.notSure")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("pantry.review.notSureHint")}</p>
          <ul className="mt-3 flex flex-col">
            {unsure.map((row) => (
              <ItemRow key={row.key} row={row} showPlace onToggle={() => toggle(row.key)} onRename={(name) => rename(row.key, name)} />
            ))}
          </ul>
        </Tile>
      ) : null}

      {shownPlaces.map((place) => {
        const group = groups.find((g) => g.place === place);
        const Icon = PLACE_ICONS[place];
        return (
          <Tile as="section" key={place} aria-labelledby={`pantry-place-${place}`} className="p-5">
            <h2 id={`pantry-place-${place}`} className="flex items-center gap-2.5 text-lg font-bold text-text">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-primary-text">
                <Icon className="h-4 w-4" />
              </span>
              {t(`pantry.places.${place}`)}
            </h2>
            {group?.aisles.map(({ aisle, items }) => (
              <div key={aisle} className="mt-4">
                <TileLabel as="h3" className="mb-1">
                  {t(`pantry.aisles.${aisle}`)}
                </TileLabel>
                <ul className="flex flex-col">
                  {items.map((item) => {
                    const row = rows.find((r) => r.key === item.key)!;
                    return <ItemRow key={row.key} row={row} onToggle={() => toggle(row.key)} onRename={(name) => rename(row.key, name)} />;
                  })}
                </ul>
              </div>
            ))}
            <div className="mt-4">
              <AddMissed place={place} onAdd={(name) => addManual(place, name)} />
            </div>
          </Tile>
        );
      })}

      {notSeen.length > 0 ? (
        <Tile as="section" aria-labelledby="pantry-not-seen" className="p-5">
          <h2 id="pantry-not-seen" className="text-lg font-bold text-text">
            {t("pantry.review.notSeenTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("pantry.review.notSeenHint")}</p>
          <ul className="mt-3 flex flex-col">
            {notSeen.map((item) => (
              <li key={item.id}>
                <CheckRow
                  checked={gone.has(item.id)}
                  label={item.name}
                  detail={t(`pantry.places.${item.place}`)}
                  onToggle={() =>
                    setGone((set) => {
                      const next = new Set(set);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </Tile>
      ) : null}

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-[22px] border border-border bg-surface/95 p-2 shadow-lift backdrop-blur md:bottom-6">
        <Button variant="ghost" trackId="pantry.review.back" onClick={onBack} disabled={saving}>
          {t("pantry.review.back")}
        </Button>
        <Button size="lg" trackId="pantry.review.save" busy={saving} onClick={() => void save()}>
          {tickedCount > 0 ? t("pantry.review.save", { count: tickedCount }) : t("pantry.review.saveNone")}
        </Button>
      </div>
    </div>
  );
}

function ItemRow({ row, showPlace, onToggle, onRename }: { row: Row; showPlace?: boolean; onToggle: () => void; onRename: (name: string) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.name);

  if (editing) {
    return (
      <li className="py-1.5">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onRename(draft.trim() || row.name);
            setEditing(false);
          }}
        >
          <input
            // Moving focus into the box the person just asked to edit.
            autoFocus
            aria-label={t("pantry.review.rename", { name: row.name })}
            value={draft}
            maxLength={60}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              onRename(draft.trim() || row.name);
              setEditing(false);
            }}
            className={cn(inputClass, "h-11 flex-1")}
          />
        </form>
      </li>
    );
  }

  const detail = [row.brand, showPlace ? t(`pantry.places.${row.place}`) : null, row.containerUnknown ? t("pantry.review.containerHint") : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex items-center gap-1 sm:max-w-md">
      <CheckRow checked={row.ticked} label={row.name} detail={detail || null} onToggle={onToggle} />
      <IconButton
        label={t("pantry.review.rename", { name: row.name })}
        trackId="pantry.review.rename"
        tooltip={false}
        icon={<Pencil aria-hidden className="h-4 w-4" />}
        onClick={() => {
          setDraft(row.name);
          setEditing(true);
        }}
      />
    </li>
  );
}

function CheckRow({ checked, label, detail, onToggle }: { checked: boolean; label: string; detail: string | null; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-track="pantry.review.toggle"
      onClick={onToggle}
      className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-element"
    >
      <span
        aria-hidden
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors",
          checked ? "border-primary bg-primary text-on-primary" : "border-border bg-surface",
        )}
      >
        {checked ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0">
        <bdi className={cn("block text-[15px] font-medium", checked ? "text-text" : "text-muted")}>{label}</bdi>
        {detail ? <span className="block text-[13px] text-muted">{detail}</span> : null}
      </span>
    </button>
  );
}

function AddMissed({ place, onAdd }: { place: PantryPlace; onAdd: (name: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  return (
    <AddItemField
      label={t("pantry.review.addMissed")}
      value={draft}
      onChange={setDraft}
      onAdd={() => {
        const name = draft.trim();
        if (!name) return;
        onAdd(name);
        setDraft("");
      }}
      maxLength={60}
      addLabel={t("pantry.addTo", { place: t(`pantry.places.${place}`) })}
      trackId={`pantry.review.add.${place}`}
    />
  );
}
