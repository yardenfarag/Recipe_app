"use client";

import { Camera, CircleAlert, DoorOpen, Eye, ImagePlus, LoaderCircle, Rows3, Smartphone, Sun, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";

import { PANTRY_PLACES, type PantryPlace } from "@shared/types/pantry";

import { PLACE_ICONS } from "@/components/pantry/places";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Tile } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import type { ScanEntry } from "@/lib/pantry/useScan";

const TIPS = [
  { key: "tipDoor", Icon: DoorOpen },
  { key: "tipLight", Icon: Sun },
  { key: "tipShelf", Icon: Rows3 },
  { key: "tipHidden", Icon: Eye },
] as const;

/**
 * Step one of a scan: pick a place, add photos (upload, drop, or from the phone), and watch each one get read. A
 * photo that came out too dark or blurry says so with a Retake; one that isn't a kitchen says it wasn't counted.
 */
export function ScanCapture({
  place,
  onPlace,
  entries,
  onFiles,
  onRetry,
  onRemove,
  onUsePhone,
}: {
  place: PantryPlace;
  onPlace: (place: PantryPlace) => void;
  entries: ScanEntry[];
  onFiles: (files: File[], place: PantryPlace) => void;
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
  onUsePhone: () => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const placeName = t(`pantry.places.${place}`);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files, place);
  }

  return (
    <div className="flex flex-col gap-5">
      <ul aria-label={t("pantry.scan.intro")} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {TIPS.map(({ key, Icon }) => (
          <li key={key} className="flex items-center gap-2.5 rounded-2xl bg-element px-3.5 py-3 text-sm font-medium text-text">
            <Icon aria-hidden className="h-[18px] w-[18px] shrink-0 text-primary-text" />
            <span className="min-w-0">{t(`pantry.scan.${key}`)}</span>
          </li>
        ))}
      </ul>

      <div role="radiogroup" aria-label={t("pantry.scan.title")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PANTRY_PLACES.map((value) => {
          const Icon = PLACE_ICONS[value];
          const mine = entries.filter((entry) => entry.place === value);
          const items = mine.reduce((sum, entry) => sum + (entry.photo?.items.length ?? 0), 0);
          const on = value === place;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              data-track={`pantry.scan.place.${value}`}
              onClick={() => onPlace(value)}
              className={cn(
                "flex min-h-28 flex-col items-start gap-2 rounded-tile border bg-surface p-4 text-start transition-colors",
                on ? "border-primary ring-2 ring-primary ring-inset" : "border-border hover:bg-element",
              )}
            >
              <span aria-hidden className={cn("grid h-9 w-9 place-items-center rounded-xl", on ? "bg-primary text-on-primary" : "bg-primary-soft text-primary-text")}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg leading-tight font-bold text-text">{t(`pantry.places.${value}`)}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                  {mine.length > 0
                    ? `${t("pantry.scan.photos", { count: mine.length })} · ${t("pantry.scan.items", { count: items })}`
                    : t(`pantry.placeHints.${value}`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Tile className="p-3 md:p-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex min-h-44 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors",
            dragging ? "border-primary bg-selected" : "border-border bg-element",
          )}
        >
          <span aria-hidden className="grid h-11 w-11 place-items-center rounded-xl bg-surface text-primary-text">
            <Camera className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-xl font-bold text-balance text-text">{t("pantry.scan.addPhotos")}</p>
            <p className="mt-0.5 text-sm text-muted">
              {placeName} · {t(`pantry.placeHints.${place}`)}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button trackId="pantry.scan.upload" onClick={() => input.current?.click()}>
              <ImagePlus aria-hidden className="h-[18px] w-[18px]" />
              {t("pantry.scan.upload")}
            </Button>
            {/* A phone already offers its camera in the file picker; the QR code is for computers. */}
            <Button variant="secondary" trackId="pantry.scan.use_phone" onClick={onUsePhone} className="pointer-coarse:hidden">
              <Smartphone aria-hidden className="h-[18px] w-[18px]" />
              {t("pantry.scan.usePhone")}
            </Button>
          </div>
          <p className="hidden text-[13px] text-muted pointer-fine:block">{t("pantry.scan.dropHere")}</p>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) onFiles(files, place);
            }}
          />
        </div>
      </Tile>

      {entries.length > 0 ? (
        <ul aria-live="polite" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {entries.map((entry) => (
            <PhotoCard
              key={entry.key}
              entry={entry}
              onRetake={() => {
                // The new photo replaces this one, in the same place. Opened from the click, so the picker is allowed.
                onRemove(entry.key);
                onPlace(entry.place);
                input.current?.click();
              }}
              onRetry={() => onRetry(entry.key)}
              onRemove={() => onRemove(entry.key)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PhotoCard({ entry, onRetake, onRetry, onRemove }: { entry: ScanEntry; onRetake: () => void; onRetry: () => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const Icon = PLACE_ICONS[entry.place];
  const quality = entry.photo?.quality ?? "ok";
  const problem = entry.status === "done" && quality !== "ok";
  const count = entry.photo?.items.length ?? 0;

  let status: string;
  let hint: string | null = null;
  if (entry.status === "reading") status = t("pantry.scan.reading");
  else if (entry.status === "failed") status = t("pantry.scan.failed");
  else if (entry.status === "unreadable") status = t("pantry.scan.photoUnreadable");
  else if (entry.status === "limited") status = t("pantry.scan.dailyLimit");
  else if (quality === "not_kitchen") {
    status = t("pantry.scan.notKitchen");
    hint = t("pantry.scan.notKitchenHint");
  } else if (quality !== "ok") {
    status = `${t(quality === "too_dark" ? "pantry.scan.tooDark" : quality === "blurry" ? "pantry.scan.blurry" : "pantry.scan.tooFar")} · ${t("pantry.scan.items", { count })}`;
    hint = t("pantry.scan.qualityHint");
  } else {
    status = count > 0 ? t("pantry.scan.items", { count }) : t("pantry.scan.nothingFound");
    if (entry.photo?.truncated) hint = t("pantry.scan.truncatedHint");
  }
  const bad = entry.status === "failed" || entry.status === "unreadable" || entry.status === "limited" || problem;

  return (
    <li className="flex flex-col overflow-hidden rounded-tile border border-border bg-surface">
      <div className="relative aspect-[4/3] overflow-hidden bg-element">
        {entry.preview ? (
          // A local object URL of the photo just chosen; next/image can't optimise those.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.preview} alt="" className={cn("absolute inset-0 h-full w-full object-cover", entry.status === "reading" && "opacity-60")} />
        ) : (
          <span aria-hidden className="grid h-full w-full place-items-center text-muted">
            {entry.fromPhone ? <Smartphone className="h-8 w-8" /> : <Icon className="h-8 w-8" />}
          </span>
        )}
        {entry.status === "reading" ? (
          <span aria-hidden className="absolute inset-0 grid place-items-center">
            <LoaderCircle className="h-8 w-8 animate-spin text-on-scrim drop-shadow" />
          </span>
        ) : null}
        <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-scrim px-2 py-1 text-xs font-semibold text-on-scrim">
          <Icon aria-hidden className="h-3.5 w-3.5" />
          {entry.fromPhone ? t("pantry.scan.fromPhone") : t(`pantry.places.${entry.place}`)}
        </span>
        <IconButton
          label={t("pantry.scan.removePhoto")}
          trackId="pantry.scan.remove_photo"
          tooltip={false}
          onClick={onRemove}
          variant="photo"
          icon={<X aria-hidden className="h-4 w-4" />}
          className="absolute end-1.5 top-1.5 h-9 w-9"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className={cn("flex items-start gap-1.5 text-sm font-semibold", bad ? "text-warning" : "text-text")}>
          {bad ? <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> : null}
          <span className="min-w-0">{status}</span>
        </p>
        {hint ? <p className="text-[13px] leading-snug text-muted">{hint}</p> : null}
        {problem && quality !== "not_kitchen" && !entry.fromPhone ? (
          <Button variant="secondary" size="sm" trackId="pantry.scan.retake" onClick={onRetake} className="mt-auto self-start">
            <Camera aria-hidden className="h-4 w-4" />
            {t("pantry.scan.retake")}
          </Button>
        ) : null}
        {entry.status === "failed" && entry.file ? (
          <Button variant="secondary" size="sm" trackId="pantry.scan.retry" onClick={onRetry} className="mt-auto self-start">
            {t("pantry.scan.tryAgain")}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
