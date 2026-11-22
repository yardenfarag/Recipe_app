"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cookbookFileName, type CookbookBook, type CookbookPageSize } from "@shared/lib/cookbook/buildCookbookHtml";
import { buildCookbookBook, buildCookbookDocument } from "@shared/lib/cookbook/cookbookDocument";
import type { Recipe } from "@shared/types/recipe";

import { useLanguage } from "@/components/LanguageProvider";
import { loadImages as loadImagesDefault } from "@/lib/cookbook/loadImages";
import { openInNewTab as openInNewTabDefault, preparePrintFrame as preparePrintFrameDefault, type PrintFrame } from "@/lib/cookbook/printFrame";
import {
  PdfRequestError,
  requestCookbookPdf as requestCookbookPdfDefault,
  saveFile as saveFileDefault,
  type PdfFailure,
} from "@/lib/cookbook/requestPdf";
import { useMeasurementSystem } from "@/lib/recipe/useMeasurementSystem";
import { useUnitSystem } from "@/lib/recipe/useUnitSystem";
import { getSupabase } from "@/lib/supabase";

export type CookbookBuildState =
  | { step: "idle" }
  /** The server is making the PDF. */
  | { step: "making" }
  /** Printing: loading the photos, `done` of `total`. */
  | { step: "photos"; done: number; total: number }
  /** Printing: laying out the pages and waiting for the fonts. */
  | { step: "pages" }
  /**
   * Done. `download`: the PDF was saved as `fileName` (and can be printed too). `print`: the print dialog opened on
   * the book, the way left when the server couldn't make the file. `missingPhotos` show a placeholder instead.
   */
  | { step: "ready"; via: "download"; fileName: string; missingPhotos: number }
  | { step: "ready"; via: "print"; missingPhotos: number }
  /** `canPrint`: printing (Save as PDF) is still open when the file couldn't be made. */
  | { step: "failed"; message: string; canPrint: boolean };

export type CookbookBuildInput = {
  title: string;
  recipes: Recipe[];
  pageSize: CookbookPageSize;
  includePhotos: boolean;
};

type Deps = {
  requestPdf: typeof requestCookbookPdfDefault;
  saveFile: typeof saveFileDefault;
  getAccessToken: () => Promise<string | null>;
  loadImages: typeof loadImagesDefault;
  preparePrintFrame: typeof preparePrintFrameDefault;
  openInNewTab: typeof openInNewTabDefault;
};

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

async function sessionToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Lets the screen paint the latest progress before the browser's print dialog takes over. */
const nextPaint = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(resolve, 0));
    else setTimeout(resolve, 0);
  });

const photoUrls = (input: CookbookBuildInput) => (input.includePhotos ? input.recipes.map((recipe) => recipe.image_url?.trim() || null) : []);

const FAILURE_KEYS: Record<PdfFailure, string> = {
  busy: "web.cookbook.pdfBusy",
  signed_out: "web.cookbook.pdfSignedOut",
  unavailable: "web.cookbook.pdfFailed",
  failed: "web.cookbook.pdfFailed",
};

/**
 * Makes the book. `build` asks the web app's server for the PDF and saves it as a download: one press, a real file,
 * the photos fetched by the server so a recipe site's settings don't matter. `print` opens the browser's print
 * dialog on the same book, for paper, or when the server couldn't make the file. Whatever was made stays until
 * `close`, so downloading or printing again is instant. Cancel stops at any point.
 */
export function useCookbookBuild(deps: Partial<Deps> = {}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { system } = useMeasurementSystem();
  const { units } = useUnitSystem();
  const [state, setState] = useState<CookbookBuildState>({ step: "idle" });
  const controller = useRef<AbortController | null>(null);
  const frame = useRef<PrintFrame | null>(null);
  const html = useRef<string | null>(null);
  const file = useRef<{ blob: Blob; name: string } | null>(null);
  /** The last book asked for, and which of its photos the server couldn't load. */
  const last = useRef<{ input: CookbookBuildInput; missing: number[] | null } | null>(null);
  const requestPdf = deps.requestPdf ?? requestCookbookPdfDefault;
  const saveFile = deps.saveFile ?? saveFileDefault;
  const getAccessToken = deps.getAccessToken ?? sessionToken;
  const loadImages = deps.loadImages ?? loadImagesDefault;
  const preparePrintFrame = deps.preparePrintFrame ?? preparePrintFrameDefault;
  const openInNewTab = deps.openInNewTab ?? openInNewTabDefault;

  const discard = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    frame.current?.dispose();
    frame.current = null;
    html.current = null;
    file.current = null;
  }, []);

  useEffect(() => discard, [discard]);

  const bookFor = useCallback(
    (input: CookbookBuildInput, images: (string | null)[]): CookbookBook =>
      buildCookbookBook({
        title: input.title,
        recipes: input.recipes,
        images,
        language,
        measurementSystem: system,
        units,
        pageSize: input.pageSize,
        includePhotos: input.includePhotos,
        t,
      }),
    [language, system, t, units],
  );

  const build = useCallback(
    async (input: CookbookBuildInput) => {
      discard();
      const abort = new AbortController();
      controller.current = abort;
      last.current = { input, missing: null };
      setState({ step: "making" });
      try {
        const accessToken = await getAccessToken();
        if (abort.signal.aborted) return;
        if (!accessToken) throw new PdfRequestError("signed_out");
        const result = await requestPdf(bookFor(input, photoUrls(input)), { accessToken, signal: abort.signal });
        if (abort.signal.aborted) return;
        const name = cookbookFileName(input.title);
        file.current = { blob: result.file, name };
        last.current = { input, missing: result.missingPhotos };
        controller.current = null;
        saveFile(result.file, name);
        setState({ step: "ready", via: "download", fileName: name, missingPhotos: result.missingPhotos.length });
      } catch (error) {
        if (isAbort(error) || abort.signal.aborted) return;
        const reason: PdfFailure = error instanceof PdfRequestError ? error.reason : "failed";
        if (!(error instanceof PdfRequestError)) console.warn("[cookbook] PDF failed", error);
        controller.current = null;
        setState({ step: "failed", message: t(FAILURE_KEYS[reason]), canPrint: reason !== "signed_out" });
      }
    },
    [bookFor, discard, getAccessToken, requestPdf, saveFile, t],
  );

  /**
   * Opens the print dialog on the book. After a download, the server has said which photos are missing, so the page
   * is laid out straight away; otherwise the photos load first, with progress, as they would for the PDF.
   */
  const print = useCallback(async () => {
    if (frame.current) {
      try {
        frame.current.print();
      } catch (error) {
        console.warn("[cookbook] print failed", error);
        setState({ step: "failed", message: t("cookbook.generateFailed"), canPrint: false });
      }
      return;
    }
    const current = last.current;
    if (!current) return;
    const { input, missing } = current;
    const downloaded = state.step === "ready" && state.via === "download" ? state : null;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const urls = photoUrls(input);
    try {
      let images: (string | null)[];
      if (missing) {
        const gone = new Set(missing);
        images = urls.map((url, index) => (url && !gone.has(index) ? url : null));
      } else {
        let loaded: boolean[] = [];
        if (urls.some(Boolean)) {
          setState({ step: "photos", done: 0, total: 0 });
          loaded = await loadImages(urls, {
            signal: abort.signal,
            // Cancelled: the loader may still report or finish, but the dialog stays closed.
            onProgress: (done, total) => {
              if (!abort.signal.aborted) setState({ step: "photos", done, total });
            },
          });
        }
        if (abort.signal.aborted) return;
        images = urls.map((url, index) => (url && loaded[index] ? url : null));
      }
      setState({ step: "pages" });
      await nextPaint();
      if (abort.signal.aborted) return;

      const document = buildCookbookDocument({
        title: input.title,
        recipes: input.recipes,
        images,
        language,
        measurementSystem: system,
        units,
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
      const missingPhotos = urls.filter((url, index) => url && !images[index]).length;
      setState(downloaded ?? { step: "ready", via: "print", missingPhotos });
      await nextPaint();
      ready.print();
    } catch (error) {
      if (isAbort(error) || abort.signal.aborted) return;
      console.warn("[cookbook] print failed", error);
      frame.current?.dispose();
      frame.current = null;
      setState({ step: "failed", message: t("cookbook.generateFailed"), canPrint: false });
    }
  }, [language, loadImages, preparePrintFrame, state, system, t, units]);

  /** Retries whatever was last asked for. */
  const retry = useCallback(() => {
    if (last.current) void build(last.current.input);
  }, [build]);

  /** Stops whatever is under way, or puts the finished book away. */
  const close = useCallback(() => {
    discard();
    setState({ step: "idle" });
  }, [discard]);

  const downloadAgain = useCallback(() => {
    if (file.current) saveFile(file.current.blob, file.current.name);
  }, [saveFile]);

  const openInTab = useCallback(() => (html.current ? openInNewTab(html.current) : false), [openInNewTab]);

  return { state, build, print, retry, close, downloadAgain, openInTab };
}
