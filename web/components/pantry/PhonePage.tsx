"use client";

import { Camera, CircleAlert, CircleCheck, Images, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { isAppLanguageCode } from "@shared/lib/appLanguages";
import { newSessionId } from "@shared/lib/interactionQueue";
import { finishHandoff, openHandoff, readHandoffToken, uploadHandoffPhoto, type HandoffPurpose } from "@shared/lib/supabase/pantry";
import { PANTRY_PLACES, type PantryPlace, type ScanPhoto } from "@shared/types/pantry";

import { useAuth } from "@/components/AuthProvider";
import { PinchLogo } from "@/components/CookieMark";
import { useLanguage } from "@/components/LanguageProvider";
import { PLACE_ICONS } from "@/components/pantry/places";
import { Button } from "@/components/ui/Button";
import { usePageTitle } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { compressImageFile } from "@/lib/compressImage";
import { isSamePhoto, photoFingerprint, type Fingerprint } from "@/lib/pantry/photoFingerprint";

type Link = { token: string; purpose: HandoffPurpose; place: PantryPlace };
type Sent = { key: string; preview: string; place: PantryPlace; status: "sending" | "done" | "failed"; photo?: ScanPhoto; limited?: boolean; similar?: boolean };

/**
 * The page a phone opens from the QR code on the computer (PIN-181): /app/phone#<token>. No app and no sign-in;
 * the token in the address fragment (never sent to a server log) is the only key, and only lets this page send
 * photos to that one session. Pantry photos are read here and now and show up on the computer; a Snap or Guess
 * photo is handed to the computer, which carries on with it.
 */
export function PhonePage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const { language, setLanguage, ready } = useLanguage();
  const [link, setLink] = useState<Link | null>(null);
  const [state, setState] = useState<"opening" | "ready" | "expired">("opening");
  const [linkLanguage, setLinkLanguage] = useState<string | null>(null);
  usePageTitle(t("pantry.phone.pageTitle"));

  useEffect(() => {
    const token = readHandoffToken(window.location.hash);
    if (!token) {
      // The token is in the address, read once the page is in the browser.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("expired");
      return;
    }
    void openHandoff(token).then((opened) => {
      if ("status" in opened) {
        setState("expired");
        return;
      }
      setLink({ token, purpose: opened.purpose, place: opened.place ?? "fridge" });
      setLinkLanguage(opened.language);
      setState("ready");
    });
  }, []);

  // The computer's language, unless this phone is signed in with its own.
  useEffect(() => {
    if (loading || !ready || user || !linkLanguage || !isAppLanguageCode(linkLanguage) || linkLanguage === language) return;
    setLanguage(linkLanguage);
  }, [loading, ready, user, linkLanguage, language, setLanguage]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center py-2">
        <PinchLogo narrowCompact />
      </header>
      <main id="main" className="flex flex-1 flex-col pt-4">
        <h1 className="font-display text-[28px] leading-tight font-bold text-text">{t("pantry.phone.pageTitle")}</h1>
        {state === "opening" ? <LoadingState label={t("pantry.phone.opening")} /> : null}
        {state === "expired" ? (
          <p role="alert" className="mt-4 flex items-start gap-2.5 rounded-2xl bg-warning-soft px-4 py-3 text-[15px] text-warning">
            <CircleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
            {t("pantry.phone.linkExpired")}
          </p>
        ) : null}
        {state === "ready" && link ? <PhoneCamera link={link} onExpired={() => setState("expired")} /> : null}
      </main>
    </div>
  );
}

function PhoneCamera({ link, onExpired }: { link: Link; onExpired: () => void }) {
  const { t } = useTranslation();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState<PantryPlace>(link.place);
  const [sent, setSent] = useState<Sent[]>([]);
  const [finished, setFinished] = useState(false);
  const fingerprints = useRef(new Map<string, Fingerprint>());
  const pantry = link.purpose === "pantry";
  const busy = sent.some((item) => item.status === "sending");
  const handedOver = !pantry && sent.some((item) => item.status === "done");
  const sentCount = sent.filter((item) => item.status === "done").length;

  function sendAll(files: File[]) {
    // One photo for Snap and Guess; any number for the pantry, two at a time so the phone stays quick.
    const queue = pantry ? files : files.slice(0, 1);
    let next = 0;
    const worker = async () => {
      while (next < queue.length) await send(queue[next++]);
    };
    void Promise.all([worker(), worker()]);
  }

  async function finish() {
    setFinished(true);
    await finishHandoff(link.token).catch(() => undefined);
  }

  async function send(file: File) {
    const key = newSessionId();
    const preview = URL.createObjectURL(file);
    setSent((list) => [{ key, preview, place, status: "sending" }, ...list]);
    if (pantry) {
      // The same shot picked twice is skipped here, before it costs anything.
      const print = await photoFingerprint(file);
      if (print && [...fingerprints.current.values()].some((other) => isSamePhoto(other, print))) {
        setSent((list) => list.map((item) => (item.key === key ? { ...item, status: "done", similar: true } : item)));
        return;
      }
      if (print) fingerprints.current.set(key, print);
    }
    const image = await compressImageFile(file, pantry ? "pantry" : "standard");
    if (!image) {
      setSent((list) => list.map((item) => (item.key === key ? { ...item, status: "failed" } : item)));
      return;
    }
    const result = await uploadHandoffPhoto(link.token, image.base64, pantry ? place : undefined);
    if (result.status !== "ok") {
      if (result.code === "handoff_expired" || result.code === "handoff_not_found") onExpired();
      setSent((list) => list.map((item) => (item.key === key ? { ...item, status: "failed", limited: result.code === "daily_limit" } : item)));
      return;
    }
    setSent((list) =>
      list.map((item) => (item.key === key ? { ...item, status: "done", photo: result.photo, similar: result.photo?.duplicate === true } : item)),
    );
  }

  if (finished) {
    return (
      <div role="status" className="mt-6 flex flex-1 flex-col items-center gap-3 text-center">
        <span aria-hidden className="grid h-16 w-16 place-items-center rounded-[20px] bg-success-soft text-success">
          <CircleCheck className="h-8 w-8" />
        </span>
        <h2 className="font-display text-2xl font-bold text-text">{t("pantry.phone.doneTitle")}</h2>
        <p className="max-w-sm text-[15px] leading-relaxed text-muted">{t("pantry.phone.doneBody")}</p>
        {sentCount > 0 ? <p className="text-sm font-semibold text-text">{t("pantry.phone.arrived", { count: sentCount })}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-1 flex-col gap-5">
      <p className="text-[15px] leading-relaxed text-muted">
        {t(pantry ? "pantry.phone.pagePantry" : link.purpose === "snap" ? "pantry.phone.pageSnap" : "pantry.phone.pageGuess")}
      </p>

      {pantry ? (
        <div>
          <p id="phone-place" className="mb-2 text-sm font-semibold text-text">
            {t("pantry.phone.where")}
          </p>
          <div role="radiogroup" aria-labelledby="phone-place" className="grid grid-cols-2 gap-2">
            {PANTRY_PLACES.map((value) => {
              const Icon = PLACE_ICONS[value];
              const on = value === place;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-track={`phone.place.${value}`}
                  onClick={() => setPlace(value)}
                  className={cn(
                    "flex min-h-14 items-center gap-2.5 rounded-2xl border px-3.5 text-start text-[15px] font-semibold transition-colors",
                    on ? "border-primary bg-primary-soft text-text ring-2 ring-primary ring-inset" : "border-border bg-surface text-text",
                  )}
                >
                  <Icon aria-hidden className="h-5 w-5 shrink-0 text-primary-text" />
                  {t(`pantry.places.${value}`)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {handedOver ? (
        <p role="status" className="flex items-center gap-2.5 rounded-2xl bg-success-soft px-4 py-3 text-[15px] font-semibold text-success">
          <CircleCheck aria-hidden className="h-5 w-5 shrink-0" />
          {t("pantry.phone.sent")}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth trackId="phone.take" disabled={busy && !pantry} onClick={() => camera.current?.click()}>
            <Camera aria-hidden className="h-5 w-5" />
            {sent.length > 0 ? t("pantry.phone.takeAnother") : t("pantry.phone.take")}
          </Button>
          <Button size="lg" fullWidth variant="secondary" trackId="phone.choose" disabled={busy && !pantry} onClick={() => library.current?.click()}>
            <Images aria-hidden className="h-5 w-5" />
            {t("pantry.phone.choose")}
          </Button>
        </div>
        {pantry ? <p className="text-center text-sm text-muted">{t("pantry.phone.multiHint")}</p> : null}
      </div>
      {/* The camera, straight away; and the photo library, where several can be picked at once. */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) sendAll(files);
        }}
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        multiple={pantry}
        hidden
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) sendAll(files);
        }}
      />

      {sent.length > 0 ? (
        <ul aria-live="polite" className="flex flex-col gap-2">
          {sent.map((item) => (
            <SentRow key={item.key} item={item} pantry={pantry} />
          ))}
        </ul>
      ) : null}

      {pantry && sentCount > 0 ? (
        // The way out: says the phone's part is over, and closes the code on the computer.
        <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] mt-auto pt-2">
          <Button size="lg" variant="secondary" fullWidth trackId="phone.done" disabled={busy} onClick={() => void finish()} className="border-2 border-primary">
            <CircleCheck aria-hidden className="h-5 w-5" />
            {t("pantry.phone.imDone")}
          </Button>
        </div>
      ) : null}
      {handedOver ? <p className="mt-auto text-center text-sm text-muted">{t("pantry.phone.finished")}</p> : null}
    </div>
  );
}

function SentRow({ item, pantry }: { item: Sent; pantry: boolean }) {
  const { t } = useTranslation();
  const quality = item.photo?.quality ?? "ok";
  const count = item.photo?.items.length ?? 0;
  let text: string;
  let warn = false;
  if (item.status === "sending") text = pantry ? t("pantry.scan.reading") : t("pantry.phone.sending");
  else if (item.status === "failed") {
    text = item.limited ? t("pantry.scan.dailyLimit") : t("pantry.scan.failed");
    warn = true;
  } else if (item.similar) text = t("pantry.scan.samePhoto");
  else if (!pantry) text = t("pantry.phone.sent");
  else if (quality === "not_kitchen") {
    text = t("pantry.scan.notKitchen");
    warn = true;
  } else if (quality !== "ok") {
    text = `${t(quality === "too_dark" ? "pantry.scan.tooDark" : quality === "blurry" ? "pantry.scan.blurry" : "pantry.scan.tooFar")} · ${t("pantry.scan.items", { count })}`;
    warn = true;
  } else text = count > 0 ? t("pantry.scan.items", { count }) : t("pantry.scan.nothingFound");

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2">
      {/* A local preview of the photo just taken. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.preview} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
      <span className="min-w-0 flex-1">
        {pantry ? <span className="block text-[13px] text-muted">{t(`pantry.places.${item.place}`)}</span> : null}
        <span className={cn("flex items-center gap-1.5 text-[15px] font-semibold", warn ? "text-warning" : "text-text")}>
          {item.status === "sending" ? <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" /> : null}
          {text}
        </span>
        {pantry && quality !== "ok" && item.status === "done" ? (
          <span className="block text-[13px] text-muted">{t(quality === "not_kitchen" ? "pantry.scan.notKitchenHint" : "pantry.scan.qualityHint")}</span>
        ) : null}
      </span>
    </li>
  );
}
