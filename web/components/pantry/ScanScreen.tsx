"use client";

import { ArrowLeft, ArrowRight, Check, LoaderCircle, ScanLine } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { mergeScanPhotos } from "@shared/lib/pantry";
import { saveScan, type NewPantryItem } from "@shared/lib/supabase/pantry";
import { showToast } from "@shared/lib/toast";
import { PANTRY_PLACES, type PantryPlace, type ScanPhoto } from "@shared/types/pantry";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { PhoneHandoffDialog } from "@/components/pantry/PhoneHandoffDialog";
import { ScanCapture } from "@/components/pantry/ScanCapture";
import { ScanReview } from "@/components/pantry/ScanReview";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { safeNextPath } from "@/lib/nextPath";
import { usePantry } from "@/lib/pantry/usePantry";
import { useScan } from "@/lib/pantry/useScan";

const DEFAULT_NEXT = "/settings/pantry";

function placeParam(raw: string | null): PantryPlace {
  return (PANTRY_PLACES as readonly string[]).includes(raw ?? "") ? (raw as PantryPlace) : "fridge";
}

/**
 * Scan your kitchen (PIN-181): photos of the fridge, freezer and cupboards in, a checked list out. `?place=` picks
 * where to start, `?next=` where to go after saving (the first-recipes picker, from onboarding).
 */
export function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const { language } = useLanguage();
  const next = params.get("next") ? safeNextPath(params.get("next")) : DEFAULT_NEXT;
  const [place, setPlace] = useState<PantryPlace>(() => placeParam(params.get("place")));
  const [step, setStep] = useState<"capture" | "review">("capture");
  const [phoneOpen, setPhoneOpen] = useState(false);
  const scan = useScan(language);
  const pantry = usePantry();

  const done = useMemo(() => scan.entries.filter((entry) => entry.status === "done" && entry.photo).map((entry) => entry.photo as ScanPhoto), [scan.entries]);
  const itemCount = useMemo(() => mergeScanPhotos(done).length, [done]);
  const reading = scan.entries.some((entry) => entry.status === "reading");
  const fromPhone = scan.entries.filter((entry) => entry.fromPhone).length;
  const [nextInView, setNextInView] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const nextCard = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!node) {
      setNextInView(true);
      return;
    }
    observer.current = new IntersectionObserver(([entry]) => setNextInView(entry.isIntersecting), { threshold: 0.3 });
    observer.current.observe(node);
  }, []);

  // A new step starts at the top, with its heading read out first.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const heading = document.querySelector<HTMLElement>("#main h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [step]);

  async function save(keep: NewPantryItem[], removeIds: string[]) {
    if (!user || !scan.scanId) return;
    try {
      await saveScan(user.id, scan.scanId, keep, removeIds);
      scan.finish();
      showToast(t("pantry.review.saved"));
      router.push(next);
    } catch {
      showToast(t("pantry.saveFailed"), "error");
    }
  }

  if (!scan.scanId) return <LoadingState />;

  if (step === "review") {
    return (
      <>
        <div className="mx-auto w-full max-w-3xl">
          <PageHeader title={t("pantry.review.title")} subtitle={t("pantry.review.intro")} tabTitle={t("pantry.scan.title")} />
          <ScanSteps current={2} onBack={() => setStep("capture")} />
        </div>
        <ScanReview photos={done} saved={pantry.items} onBack={() => setStep("capture")} onSave={save} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("pantry.scan.title")}
        subtitle={t("pantry.scan.intro")}
        actions={
          <Link href={next === DEFAULT_NEXT ? DEFAULT_NEXT : next} data-track="pantry.scan.leave" className={buttonClasses({ variant: "ghost" })}>
            <ArrowLeft aria-hidden className="h-4 w-4 rtl:rotate-180" />
            {next === DEFAULT_NEXT ? t("pantry.title") : t("pantry.intro.later")}
          </Link>
        }
      />

      <ScanSteps current={1} />

      <ScanCapture
        place={place}
        onPlace={setPlace}
        entries={scan.entries}
        onFiles={(files, target) => {
          const added = scan.addFiles(files, target);
          if (added === 0) showToast(t("pantry.scan.photoUnreadable"), "error");
        }}
        onRetry={scan.retry}
        onAddAnyway={scan.addAnyway}
        onRemove={scan.remove}
        onUsePhone={() => setPhoneOpen(true)}
        nextStep={
          done.length > 0 || reading ? (
            <div ref={nextCard}>
              <NextStepCard itemCount={itemCount} reading={reading} ready={done.length > 0} onReview={() => setStep("review")} />
            </div>
          ) : null
        }
      />

      {/* The same step, kept in reach once the card above has scrolled away. */}
      {done.length > 0 && !nextInView ? (
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mt-6 flex items-center justify-between gap-3 rounded-[22px] border border-border bg-surface/95 p-2 ps-4 shadow-lift backdrop-blur md:bottom-6">
          <p aria-live="polite" className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text">
            {reading ? <LoaderCircle aria-hidden className="h-4 w-4 shrink-0 animate-spin text-muted" /> : null}
            <span className="truncate">{t("pantry.scan.nextTitle", { count: itemCount })}</span>
          </p>
          <Button size="lg" trackId="pantry.scan.review_sticky" onClick={() => setStep("review")}>
            {t("pantry.scan.nextButton")}
            <ArrowRight aria-hidden className="h-5 w-5 rtl:rotate-180" />
          </Button>
        </div>
      ) : null}

      <PhoneHandoffDialog
        open={phoneOpen}
        onOpenChange={(open) => {
          setPhoneOpen(open);
          if (!open) void scan.sync();
        }}
        purpose="pantry"
        language={language}
        scanId={scan.scanId}
        place={place}
        onTick={() => void scan.sync()}
        onFinished={() =>
          // The last photos land on the next sync; the count is read once they have.
          void scan.sync().then((count) => showToast(t("pantry.phone.phoneFinished", { count })))
        }
        arrived={fromPhone}
      />

      <Dialog open={scan.resumable !== null} onOpenChange={(open) => !open && scan.resume()}>
        {scan.resumable ? (
          <DialogContent
            title={t("pantry.scan.resumeTitle")}
            description={t("pantry.scan.resumeBody", { count: scan.resumable.length })}
            footer={
              <>
                <Button variant="ghost" trackId="pantry.scan.start_over" onClick={scan.startOver}>
                  {t("pantry.scan.startOver")}
                </Button>
                <DialogClose asChild>
                  <Button trackId="pantry.scan.resume">{t("pantry.scan.resume")}</Button>
                </DialogClose>
              </>
            }
          />
        ) : null}
      </Dialog>
    </>
  );
}

/** "1 Take photos → 2 Check and save": where the person is in the scan. On step 2, step 1 goes back. */
function ScanSteps({ current, onBack }: { current: 1 | 2; onBack?: () => void }) {
  const { t } = useTranslation();
  const steps = [t("pantry.scan.step1"), t("pantry.scan.step2")];
  return (
    <ol aria-label={t("pantry.scan.title")} className="mb-5 flex flex-wrap items-center gap-2 text-sm font-semibold">
      {steps.map((label, index) => {
        const number = index + 1;
        const done = number < current;
        const here = number === current;
        const content = (
          <>
            <span
              aria-hidden
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs",
                here ? "bg-primary text-on-primary" : done ? "bg-primary-soft text-primary-text" : "bg-element text-muted",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : number}
            </span>
            <span className={here ? "text-text" : "text-muted"}>{label}</span>
          </>
        );
        return (
          <li key={label} aria-current={here ? "step" : undefined} className="flex items-center gap-2">
            {index > 0 ? <ArrowRight aria-hidden className="h-4 w-4 text-muted rtl:rotate-180" /> : null}
            {done && onBack ? (
              <button type="button" data-track="pantry.scan.step_back" onClick={onBack} className="flex items-center gap-2 rounded-lg hover:underline">
                {content}
              </button>
            ) : (
              <span className="flex items-center gap-2">{content}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What to do now, right under the photos: how many items were found, that more places can still be added, and the
 * one button that moves on. Shown as soon as the first photo is being read.
 */
function NextStepCard({ itemCount, reading, ready, onReview }: { itemCount: number; reading: boolean; ready: boolean; onReview: () => void }) {
  const { t } = useTranslation();
  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-4 rounded-tile border-2 border-primary bg-primary-soft p-5 sm:flex-row sm:items-center sm:justify-between md:p-6"
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-on-primary">
          {reading && !ready ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold text-text">
            {ready ? t("pantry.scan.nextTitle", { count: itemCount }) : t("pantry.scan.waiting")}
          </h2>
          <p className="mt-1 text-[15px] leading-relaxed text-pretty text-muted">
            {reading && ready ? `${t("pantry.scan.waiting")} ` : null}
            {t("pantry.scan.nextBody")}
          </p>
        </div>
      </div>
      <Button size="lg" trackId="pantry.scan.review" disabled={!ready} onClick={onReview} className="shrink-0">
        {t("pantry.scan.nextButton")}
        <ArrowRight aria-hidden className="h-5 w-5 rtl:rotate-180" />
      </Button>
    </section>
  );
}
