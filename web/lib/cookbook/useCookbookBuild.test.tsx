import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { CookbookBook } from "@shared/lib/cookbook/buildCookbookHtml";
import type { Recipe } from "@shared/types/recipe";

import { PdfRequestError } from "@/lib/cookbook/requestPdf";
import { useCookbookBuild } from "@/lib/cookbook/useCookbookBuild";
import i18n from "@/lib/i18n";

vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "he", setLanguage: vi.fn() }) }));
vi.mock("@/lib/supabase", () => ({ getSupabase: vi.fn() }));
vi.mock("@/lib/recipe/useMeasurementSystem", () => ({ useMeasurementSystem: () => ({ system: "metric", setSystem: vi.fn() }) }));

const wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;

const recipe = (id: string, image_url?: string): Recipe => ({
  id,
  title: `Recipe ${id}`,
  image_url,
  ingredients: [],
  instructions: [{ step: 1, text: "Cook." }],
  servings: 1,
  extraction_status: "full",
});

const fiftyWithPhotos = Array.from({ length: 50 }, (_, index) => recipe(`r${index}`, `https://cdn.example.com/${index}.jpg`));

const pdf = new Blob(["%PDF-1.7"], { type: "application/pdf" });
const token = async () => "token";

describe("useCookbookBuild", () => {
  it("has the server make a right-to-left book in the app's language and saves it as a download", async () => {
    const requestPdf = vi.fn(async () => ({ file: pdf, missingPhotos: [3] }));
    const saveFile = vi.fn();
    const { result } = renderHook(() => useCookbookBuild({ requestPdf, saveFile, getAccessToken: token }), { wrapper });
    await act(async () => {
      await result.current.build({ title: "ספר שלי", recipes: fiftyWithPhotos, pageSize: "a4", includePhotos: true });
    });

    const [book, options] = requestPdf.mock.calls[0] as unknown as [CookbookBook, { accessToken: string }];
    expect(book).toMatchObject({ title: "ספר שלי", language: "he", rtl: true, pageSize: "a4", hideImages: false });
    expect(book.recipes).toHaveLength(50);
    expect(book.recipes[7]!.imageDataUri).toBe("https://cdn.example.com/7.jpg");
    expect(options).toMatchObject({ accessToken: "token" });
    expect(saveFile).toHaveBeenCalledWith(pdf, "ספר-שלי.pdf");
    expect(result.current.state).toEqual({ step: "ready", via: "download", fileName: "ספר-שלי.pdf", missingPhotos: 1 });

    act(() => result.current.downloadAgain());
    expect(saveFile).toHaveBeenCalledTimes(2);
  });

  it("prints the downloaded book without loading the photos again, leaving out the ones the server couldn't get", async () => {
    let html = "";
    const print = vi.fn();
    const loadImages = vi.fn();
    const { result } = renderHook(
      () =>
        useCookbookBuild({
          requestPdf: async () => ({ file: pdf, missingPhotos: [1] }),
          saveFile: vi.fn(),
          getAccessToken: token,
          loadImages,
          preparePrintFrame: async (document) => {
            html = document;
            return { print, dispose: vi.fn() };
          },
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.build({ title: "Book", recipes: fiftyWithPhotos.slice(0, 3), pageSize: "a4", includePhotos: true });
    });
    await act(async () => {
      await result.current.print();
    });

    expect(loadImages).not.toHaveBeenCalled();
    expect(print).toHaveBeenCalledTimes(1);
    expect(html).toContain("https://cdn.example.com/0.jpg");
    expect(html).not.toContain("https://cdn.example.com/1.jpg");
    expect(result.current.state).toMatchObject({ step: "ready", via: "download" });

    await act(async () => {
      await result.current.print();
    });
    expect(print).toHaveBeenCalledTimes(2);
  });

  it("offers printing when the server can't make the file, loading the photos first with progress", async () => {
    const seen: number[] = [];
    let html = "";
    const print = vi.fn();
    const { result } = renderHook(
      () =>
        useCookbookBuild({
          requestPdf: async () => Promise.reject(new PdfRequestError("unavailable")),
          saveFile: vi.fn(),
          getAccessToken: token,
          loadImages: async (urls, options) => {
            for (let done = 0; done <= urls.length; done += 10) {
              options.onProgress?.(done, urls.length);
              seen.push(done);
            }
            return urls.map(() => true);
          },
          preparePrintFrame: async (document) => {
            html = document;
            return { print, dispose: vi.fn() };
          },
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.build({ title: "ספר", recipes: fiftyWithPhotos, pageSize: "a4", includePhotos: true });
    });
    expect(result.current.state).toEqual({ step: "failed", message: i18n.t("web.cookbook.pdfFailed"), canPrint: true });

    await act(async () => {
      await result.current.print();
    });
    expect(seen).toEqual([0, 10, 20, 30, 40, 50]);
    expect(result.current.state).toEqual({ step: "ready", via: "print", missingPhotos: 0 });
    expect(print).toHaveBeenCalledTimes(1);
    expect(html).toContain('<html lang="he" dir="rtl">');
    expect(html.match(/data-cookbook-page="recipe"/g)).toHaveLength(50);
  });

  it("says to wait when too many books were made just now, and doesn't offer printing when signed out", async () => {
    const states = [];
    for (const reason of ["busy", "signed_out"] as const) {
      const { result } = renderHook(
        () => useCookbookBuild({ requestPdf: async () => Promise.reject(new PdfRequestError(reason)), saveFile: vi.fn(), getAccessToken: token }),
        { wrapper },
      );
      await act(async () => {
        await result.current.build({ title: "Book", recipes: fiftyWithPhotos.slice(0, 1), pageSize: "a4", includePhotos: true });
      });
      states.push(result.current.state);
    }
    expect(states[0]).toMatchObject({ step: "failed", canPrint: true, message: i18n.t("web.cookbook.pdfBusy") });
    expect(states[1]).toMatchObject({ step: "failed", canPrint: false, message: i18n.t("web.cookbook.pdfSignedOut") });
  });

  it("stops when cancelled, without saving anything", async () => {
    const saveFile = vi.fn();
    let release: (() => void) | undefined;
    const { result } = renderHook(
      () =>
        useCookbookBuild({
          saveFile,
          getAccessToken: token,
          requestPdf: (_book, options) =>
            new Promise((resolve, reject) => {
              options.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
              release = () => resolve({ file: pdf, missingPhotos: [] });
            }),
        }),
      { wrapper },
    );

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.build({ title: "Book", recipes: [recipe("a", "https://cdn/a.jpg")], pageSize: "a4", includePhotos: true });
    });
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(result.current.state.step).toBe("making");
    act(() => result.current.close());
    await act(async () => {
      release?.();
      await pending;
    });
    expect(result.current.state).toEqual({ step: "idle" });
    expect(saveFile).not.toHaveBeenCalled();
  });

  it("sends no photos when they're off", async () => {
    const requestPdf = vi.fn(async () => ({ file: pdf, missingPhotos: [] }));
    const { result } = renderHook(() => useCookbookBuild({ requestPdf, saveFile: vi.fn(), getAccessToken: token }), { wrapper });
    await act(async () => {
      await result.current.build({ title: "Book", recipes: fiftyWithPhotos.slice(0, 3), pageSize: "letter", includePhotos: false });
    });
    const [book] = requestPdf.mock.calls[0] as unknown as [CookbookBook];
    expect(book).toMatchObject({ hideImages: true, pageSize: "letter" });
    expect(book.recipes.every((entry) => entry.imageDataUri === null)).toBe(true);
    expect(result.current.state).toMatchObject({ step: "ready", via: "download", missingPhotos: 0 });
  });
});
