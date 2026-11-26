"use client";

import { ArrowLeft, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
          <PageHeader title={t("pantry.review.title")} tabTitle={t("pantry.scan.title")} />
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

      <ScanCapture
        place={place}
        onPlace={setPlace}
        entries={scan.entries}
        onFiles={(files, target) => {
          const added = scan.addFiles(files, target);
          if (added === 0) showToast(t("pantry.scan.photoUnreadable"), "error");
        }}
        onRetry={scan.retry}
        onRemove={scan.remove}
        onUsePhone={() => setPhoneOpen(true)}
      />

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mt-6 flex items-center justify-between gap-3 rounded-[22px] border border-border bg-surface/95 p-2 ps-4 shadow-lift backdrop-blur md:bottom-6">
        <p aria-live="polite" className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted">
          {reading ? (
            <>
              <LoaderCircle aria-hidden className="h-4 w-4 shrink-0 animate-spin" />
              <span className="truncate">{t("pantry.scan.waiting")}</span>
            </>
          ) : done.length === 0 ? (
            <span className="truncate">{t("pantry.scan.reviewEmpty")}</span>
          ) : null}
        </p>
        <Button size="lg" trackId="pantry.scan.review" disabled={done.length === 0} onClick={() => setStep("review")}>
          {t("pantry.scan.review", { count: itemCount })}
        </Button>
      </div>

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
