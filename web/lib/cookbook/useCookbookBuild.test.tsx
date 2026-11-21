import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { Recipe } from "@shared/types/recipe";

import { useCookbookBuild } from "@/lib/cookbook/useCookbookBuild";
import i18n from "@/lib/i18n";

vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "he", setLanguage: vi.fn() }) }));
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

describe("useCookbookBuild", () => {
  it("reports photo progress, then makes a right-to-left book in the app's language and prints it", async () => {
    const seen: number[] = [];
    let html = "";
    const print = vi.fn();
    const { result } = renderHook(
      () =>
        useCookbookBuild({
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

    expect(seen).toEqual([0, 10, 20, 30, 40, 50]);
    expect(result.current.state).toEqual({ step: "ready", missingPhotos: 0 });
    expect(print).toHaveBeenCalledTimes(1);
    expect(html).toContain('<html lang="he" dir="rtl">');
    expect(html.match(/data-cookbook-page="recipe"/g)).toHaveLength(50);
  });

  it("stops when cancelled, without opening the print dialog", async () => {
    let release: (() => void) | undefined;
    const preparePrintFrame = vi.fn();
    const { result } = renderHook(
      () =>
        useCookbookBuild({
          loadImages: (urls, options) =>
            new Promise((resolve, reject) => {
              options.signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
              release = () => resolve(urls.map(() => true));
            }),
          preparePrintFrame,
        }),
      { wrapper },
    );

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.build({ title: "Book", recipes: [recipe("a", "https://cdn/a.jpg")], pageSize: "a4", includePhotos: true });
    });
    expect(result.current.state.step).toBe("photos");
    act(() => result.current.close());
    await act(async () => {
      release?.();
      await pending;
    });
    expect(result.current.state).toEqual({ step: "idle" });
    expect(preparePrintFrame).not.toHaveBeenCalled();
  });

  it("skips the photo step when photos are off", async () => {
    const loadImages = vi.fn();
    const { result } = renderHook(
      () => useCookbookBuild({ loadImages, preparePrintFrame: async () => ({ print: vi.fn(), dispose: vi.fn() }) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.build({ title: "Book", recipes: fiftyWithPhotos.slice(0, 3), pageSize: "letter", includePhotos: false });
    });
    expect(loadImages).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ step: "ready", missingPhotos: 0 });
  });
});
