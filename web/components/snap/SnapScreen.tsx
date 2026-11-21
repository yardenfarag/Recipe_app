"use client";

import { ArrowRight, ImageUp, NotebookPen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { normalizeSocialUrl } from "@shared/lib/platformUrls";
import { fetchRecipeByUrl } from "@shared/lib/supabase/recipes";
import type { Recipe } from "@shared/types/recipe";

import { InventOfferDialog } from "@/components/snap/InventOfferDialog";
import { PhotoDropZone } from "@/components/snap/PhotoDropZone";
import { SnapBannerView } from "@/components/snap/SnapBannerView";
import { SnapIntentSwitch } from "@/components/snap/SnapIntentSwitch";
import { SnapProgress } from "@/components/snap/SnapProgress";
import { CreditsCard, QuickTipsCard, WriteRecipeCard } from "@/components/snap/SnapSidebar";
import { Button, buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextField } from "@/components/ui/TextField";
import { compressImageFile } from "@/lib/compressImage";
import { useCreditBalance } from "@/lib/credits/balance";
import { isPdfFile, readPdfFile } from "@/lib/readPdfFile";
import { getSnapDraft } from "@/lib/snap/draft";
import { useSnap, type SnapIntent } from "@/lib/snap/useSnap";

/** True while typing somewhere, so a paste there is left alone. */
function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)));
}

/** A dragged link: from another tab's address bar or a link on a page. */
function droppedUrl(data: DataTransfer): string | null {
  const uriList = data.getData("text/uri-list").split(/\r?\n/).find((line) => line && !line.startsWith("#"));
  return normalizeSocialUrl(uriList ?? data.getData("text/plain") ?? "");
}

const dragHasContent = (data: DataTransfer | null) =>
  Boolean(data && (data.types.includes("Files") || data.types.includes("text/uri-list") || data.types.includes("text/plain")));

/**
 * Snap: paste a link or bring a photo, and get the recipe (or, in Guess the recipe, a best guess for a dish). On the
 * web a link or photo can be pasted anywhere on the page, and a photo or link dropped onto it. While Pinch works the
 * form gives way to the progress; then the recipe opens in the preview (/recipe/preview) to save.
 */
export function SnapScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { quota, refresh } = useCreditBalance();
  const snap = useSnap({ onSettled: () => void refresh() });
  const { job, finished, banner, setBanner, run } = snap;
  const [intent, setIntent] = useState<SnapIntent>("extract");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ url: string; intent: SnapIntent; recipe: Recipe } | null>(null);
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Wraps the link field, to focus its input. */
  const urlField = useRef<HTMLDivElement>(null);
  const focusUrl = useCallback(() => urlField.current?.querySelector("input")?.focus(), []);
  const busy = job != null;
  const invent = intent === "invent";

  useEffect(() => {
    // An import that is waiting to be saved lives in this browser's storage, so it is read after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftTitle(getSnapDraft()?.recipe.title?.trim() || null);
  }, []);

  // Already in the library? Looked up as you type, so it can be opened instead of imported again.
  const target = normalizeSocialUrl(url);
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchRecipeByUrl(target, intent === "invent" ? "invented" : "extracted")
        .then((recipe) => {
          if (!cancelled) setExisting(recipe ? { url: target, intent, recipe } : null);
        })
        .catch(() => {
          // The import itself still finds a saved recipe, without charging.
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [target, intent]);
  const saved = existing && existing.url === target && existing.intent === intent ? existing.recipe : null;

  /** A photo, or in Snap a PDF too (PIN-72). Guess the recipe takes photos only. */
  const importFile = useCallback(
    async (file: File) => {
      if (busy) return;
      if (!invent && isPdfFile(file)) {
        const pdf = await readPdfFile(file);
        if (!pdf.ok) {
          setBanner({ tone: "error", message: t(pdf.reason === "too_large" ? "snap.pdfTooLarge" : "snap.pdfUnreadable") });
          return;
        }
        await run({ intent: "extract", source: { type: "pdf", base64: pdf.base64, name: file.name } });
        return;
      }
      if (!file.type.startsWith("image/")) {
        setBanner({ tone: "error", message: t(invent ? "web.snap.notAnImage" : "web.snap.notAPhotoOrPdf") });
        return;
      }
      const image = await compressImageFile(file);
      if (!image) {
        setBanner({ tone: "error", message: t("snap.photoTooLarge") });
        return;
      }
      await run({ intent, source: { type: "photo", base64: image.base64, mimeType: image.mimeType } });
    },
    [busy, intent, invent, run, setBanner, t],
  );

  const takeLink = useCallback((link: string) => {
    setUrl(link);
    setUrlError(null);
    // After the field has the link, so the caret lands at its end.
    requestAnimationFrame(focusUrl);
  }, [focusUrl]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!target) {
      setUrlError(t("snap.invalidUrl"));
      focusUrl();
      return;
    }
    if (saved) {
      router.push(`/recipe/${saved.id}`);
      return;
    }
    setUrl(target);
    void run({ intent, source: { type: "url", url: target } });
  }

  // Paste anywhere: a photo imports it; a link outside a field lands in the link field, ready to go.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (busy || document.querySelector("[role=dialog], [role=menu]")) return;
      const data = event.clipboardData;
      if (!data) return;
      const photo = Array.from(data.files).find((file) => file.type.startsWith("image/"));
      if (photo) {
        event.preventDefault();
        void importFile(photo);
        return;
      }
      if (isTypingTarget(event.target)) return;
      const link = normalizeSocialUrl(data.getData("text/plain"));
      if (link) {
        event.preventDefault();
        takeLink(link);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [busy, importFile, takeLink]);

  // Drop anywhere: a photo (or, in Snap, a PDF) imports it, a link fills the field.
  useEffect(() => {
    let depth = 0;
    const onEnter = (event: DragEvent) => {
      if (busy || !dragHasContent(event.dataTransfer)) return;
      depth += 1;
      setDragging(true);
    };
    const onOver = (event: DragEvent) => {
      if (busy || !dragHasContent(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (busy || !event.dataTransfer) return;
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (file) {
        void importFile(file);
        return;
      }
      const link = droppedUrl(event.dataTransfer);
      if (link) takeLink(link);
      else setBanner({ tone: "error", message: t("snap.invalidUrl") });
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [busy, importFile, setBanner, t, takeLink]);

  return (
    <>
      <PageHeader
        title={invent ? t("snap.inventTitle") : t("snap.title")}
        subtitle={invent ? t("snap.inventSubtitle") : t("snap.subtitle")}
        tabTitle={t("tabs.snap")}
      />

      {draftTitle && !busy ? (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-primary-soft px-4 py-3 text-sm">
          <NotebookPen aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 font-medium text-text">{t("web.snap.draftWaiting", { title: draftTitle })}</span>
          <Link href="/recipe/preview" className={buttonClasses({ variant: "primary", size: "sm" })}>
            {t("recipe.preview")}
          </Link>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0">
          {job ? (
            <SnapProgress job={job} finished={finished} />
          ) : (
            <section className="rounded-3xl border border-frosted-border bg-surface p-5 shadow-soft md:p-7">
              <SnapIntentSwitch value={intent} onChange={(next) => {
                  setIntent(next);
                  setBanner(null);
                }} />
              {invent ? <p className="mt-3 text-sm leading-relaxed text-muted">{t("snap.inventDisclaimer")}</p> : null}

              <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
                <div ref={urlField} className="min-w-0 flex-1">
                  <TextField
                    label={invent ? t("snap.inventUrlLabel") : t("snap.urlLabel")}
                    placeholder={invent ? t("snap.inventUrlPlaceholder") : t("snap.urlPlaceholder")}
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      setUrlError(null);
                      if (banner) setBanner(null);
                    }}
                    error={urlError ?? undefined}
                    type="url"
                    inputMode="url"
                    dir="ltr"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="go"
                  />
                </div>
                <Button type="submit" size="lg" disabled={!url.trim()} className="sm:mt-[26px]">
                  {invent ? t("snap.modeInvent") : t("tabs.snap")}
                  <ArrowRight aria-hidden className="h-4 w-4 rtl:rotate-180" />
                </Button>
              </form>

              {saved ? (
                <div role="status" className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-success-soft px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1 font-medium text-success">{t("recipe.alreadySaved")}</span>
                  <Link href={`/recipe/${saved.id}`} className={buttonClasses({ variant: "outline", size: "sm" })}>
                    {t("hub.openInLibrary")}
                  </Link>
                </div>
              ) : null}

              {banner ? (
                <div className="mt-3">
                  <SnapBannerView banner={banner} onDismiss={() => setBanner(null)} />
                </div>
              ) : null}

              <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-muted">
                <span aria-hidden className="h-px flex-1 bg-border" />
                {t("web.snap.or")}
                <span aria-hidden className="h-px flex-1 bg-border" />
              </div>

              <PhotoDropZone intent={intent} onFile={(file) => void importFile(file)} />
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <CreditsCard quota={quota} />
          <WriteRecipeCard />
          <QuickTipsCard />
        </aside>
      </div>

      <InventOfferDialog offer={snap.offer} onAccept={snap.acceptOffer} onExtractAnyway={snap.extractAnyway} onClose={snap.dismissOffer} />

      {dragging ? (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-overlay p-6 backdrop-blur-[2px] animate-fade-in">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary bg-surface px-10 py-8 text-center shadow-lift">
            <ImageUp className="h-10 w-10 text-primary" />
            <p className="text-lg font-bold text-text">{t(invent ? "web.snap.dropTitle" : "web.snap.dropTitlePdf")}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
