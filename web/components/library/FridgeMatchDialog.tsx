"use client";

import { ImagePlus } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { buildFridgeCatalog } from "@shared/lib/fridgeCatalog";
import { matchFridge, type FridgeMatchRow } from "@shared/lib/supabase/matchFridge";
import type { Recipe } from "@shared/types/recipe";

import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { compressImageFile } from "@/lib/compressImage";

type Problem = "limited" | "failed" | "unreadable" | null;

/**
 * "What's in the fridge?": choose a photo of the fridge or counter and see which saved recipes fit, best first,
 * with what is still missing. Only ever ranks recipes already in the library. On a phone the file picker offers
 * the camera.
 */
export function FridgeMatchDialog({ open, onOpenChange, recipes }: { open: boolean; onOpenChange: (open: boolean) => void; recipes: Recipe[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <Body recipes={recipes} /> : null}
    </Dialog>
  );
}

function Body({ recipes }: { recipes: Recipe[] }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<FridgeMatchRow[] | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const empty = recipes.length === 0;

  async function choose(file: File | undefined) {
    if (!file || loading) return;
    const id = ++run.current;
    setLoading(true);
    setProblem(null);
    setMatches(null);
    try {
      const image = await compressImageFile(file);
      if (run.current !== id) return;
      if (!image) {
        setProblem("unreadable");
        return;
      }
      const result = await matchFridge(image.base64, image.mimeType, buildFridgeCatalog(recipes));
      if (run.current !== id) return;
      if (result.code === "daily_limit") setProblem("limited");
      else if (result.status !== "ok") setProblem("failed");
      else setMatches(result.matches ?? []);
    } catch {
      if (run.current === id) setProblem("failed");
    } finally {
      if (run.current === id) setLoading(false);
    }
  }

  return (
    <DialogContent title={t("library.fridgeMatchTitle")} description={t("library.fridgeMatchHint")}>
      {empty ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-[15px] text-muted">{t("library.fridgeMatchEmptyLibrary")}</p>
          <Link href="/add" data-track="fridge_match.add_recipes" className={buttonClasses({ variant: "primary" })}>
            {t("library.snapFirst")}
          </Link>
        </div>
      ) : (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              void choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button fullWidth size="lg" trackId="fridge_match.snap" busy={loading} onClick={() => input.current?.click()}>
            {loading ? null : <ImagePlus aria-hidden className="h-5 w-5" />}
            {t("library.fridgeMatchSnap")}
          </Button>
          <div aria-live="polite">
            {loading ? <p className="mt-3 text-center text-sm text-muted">{t("library.fridgeMatching")}</p> : null}
            {problem ? (
              <p className="mt-3 text-sm font-medium text-warning">
                {problem === "limited" ? t("library.fridgeMatchLimited") : problem === "unreadable" ? t("library.fridgeMatchPhotoFailed") : t("library.fridgeMatchFailed")}
              </p>
            ) : null}
            {matches && matches.length === 0 ? <p className="mt-3 text-[15px] text-muted">{t("library.fridgeMatchEmptyResults")}</p> : null}
          </div>
          {matches && matches.length > 0 ? (
            <ul className="mt-4 flex max-h-80 flex-col gap-2 overflow-y-auto">
              {matches.map((match) => {
                const recipe = byId.get(match.id);
                if (!recipe) return null;
                return (
                  <li key={match.id}>
                    <Link
                      href={`/recipe/${recipe.id}`}
                data-track="fridge_match.open_recipe"
                      className="block rounded-2xl border border-border bg-bg px-4 py-3 transition-colors hover:bg-element"
                    >
                      <span className="block text-base font-semibold text-text">{recipe.display_title ?? recipe.title}</span>
                      {match.reason ? <span className="mt-1 block text-sm text-muted">{match.reason}</span> : null}
                      {match.missing.length > 0 ? (
                        <span className="mt-1 block text-[13px] text-warning">{t("library.fridgeMatchMissing", { items: match.missing.join(", ") })}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </DialogContent>
  );
}
