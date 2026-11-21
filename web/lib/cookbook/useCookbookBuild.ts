"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CookbookPageSize } from "@shared/lib/cookbook/buildCookbookHtml";
import { buildCookbookDocument } from "@shared/lib/cookbook/cookbookDocument";
import type { Recipe } from "@shared/types/recipe";

import { useLanguage } from "@/components/LanguageProvider";
import { loadImages as loadImagesDefault } from "@/lib/cookbook/loadImages";
import { openInNewTab as openInNewTabDefault, preparePrintFrame as preparePrintFrameDefault, type PrintFrame } from "@/lib/cookbook/printFrame";
import { useMeasurementSystem } from "@/lib/recipe/useMeasurementSystem";

export type CookbookBuildState =
  | { step: "idle" }
  /** Loading the photos: `done` of `total`. */
  | { step: "photos"; done: number; total: number }
  /** Laying out the pages and waiting for the fonts. */
  | { step: "pages" }
  /** Printed, or ready to print again. `missingPhotos` could not be loaded and show a placeholder. */
  | { step: "ready"; missingPhotos: number }
  | { step: "failed"; message: string };

export type CookbookBuildInput = {
  title: string;
  recipes: Recipe[];
  pageSize: CookbookPageSize;
  includePhotos: boolean;
};

type Deps = {
  loadImages: typeof loadImagesDefault;
  preparePrintFrame: typeof preparePrintFrameDefault;
  openInNewTab: typeof openInNewTabDefault;
};

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/** Lets the screen paint the latest progress before the browser's print dialog takes over. */
const nextPaint = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(resolve, 0));
    else setTimeout(resolve, 0);
  });

/**
 * Makes the book and opens the print dialog. Photos load first, a few at a time, with progress; then the pages are
 * laid out in a hidden frame, and the print dialog opens on it. The finished book stays until `close`, so printing
 * again, or opening it in a tab, is instant. Cancel stops at any point.
 */
export function useCookbookBuild(deps: Partial<Deps> = {}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { system } = useMeasurementSystem();
  const [state, setState] = useState<CookbookBuildState>({ step: "idle" });
  const controller = useRef<AbortController | null>(null);
  const frame = useRef<PrintFrame | null>(null);
  const html = useRef<string | null>(null);
  const loadImages = deps.loadImages ?? loadImagesDefault;
  const preparePrintFrame = deps.preparePrintFrame ?? preparePrintFrameDefault;
  const openInNewTab = deps.openInNewTab ?? openInNewTabDefault;

  const discard = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    frame.current?.dispose();
    frame.current = null;
    html.current = null;
  }, []);

  useEffect(() => discard, [discard]);

  const build = useCallback(
    async (input: CookbookBuildInput) => {
      discard();
      const abort = new AbortController();
      controller.current = abort;
      const urls = input.includePhotos ? input.recipes.map((recipe) => recipe.image_url?.trim() || null) : [];
      try {
        let loaded: boolean[] = [];
        if (urls.some(Boolean)) {
          setState({ step: "photos", done: 0, total: 0 });
          loaded = await loadImages(urls, {
            signal: abort.signal,
            onProgress: (done, total) => setState({ step: "photos", done, total }),
          });
        }
        setState({ step: "pages" });
        await nextPaint();
        if (abort.signal.aborted) return;

        const document = buildCookbookDocument({
          title: input.title,
          recipes: input.recipes,
          images: urls.map((url, index) => (url && loaded[index] ? url : null)),
          language,
          measurementSystem: system,
          pageSize: input.pageSize,
          includePhotos: input.includePhotos,
          t,
        });
        const ready = await preparePrintFrame(document, { signal: abort.signal });
        if (abort.signal.aborted) {
          ready.dispose();
          return;
        }
        frame.current = ready;
        html.current = document;
        controller.current = null;
        setState({ step: "ready", missingPhotos: urls.filter((url, index) => url && !loaded[index]).length });
        await nextPaint();
        ready.print();
      } catch (error) {
        if (isAbort(error) || abort.signal.aborted) return;
        console.warn("[cookbook] build failed", error);
        discard();
        setState({ step: "failed", message: t("cookbook.generateFailed") });
      }
    },
    [discard, language, loadImages, preparePrintFrame, system, t],
  );

  /** Stops whatever is under way, or puts the finished book away. */
  const close = useCallback(() => {
    discard();
    setState({ step: "idle" });
  }, [discard]);

  const printAgain = useCallback(() => {
    try {
      frame.current?.print();
    } catch (error) {
      console.warn("[cookbook] print failed", error);
      setState({ step: "failed", message: t("cookbook.generateFailed") });
    }
  }, [t]);

  const openInTab = useCallback(() => (html.current ? openInNewTab(html.current) : false), [openInNewTab]);

  return { state, build, close, printAgain, openInTab };
}
