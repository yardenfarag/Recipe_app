"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { addDays, mealsOfDay, toPlanDate } from "@shared/lib/mealPlan/week";
import { fetchCloudKitchenProfile } from "@shared/lib/supabase/kitchen";
import { fetchMealPlanPrefs, fetchMealPlanWithTitles, replacePlanMeal } from "@shared/lib/supabase/mealPlan";
import { showToast } from "@shared/lib/toast";
import type { MealPlanEntry, PlanMeal } from "@shared/types/mealPlan";
import type { Recipe } from "@shared/types/recipe";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { LoadingState } from "@/components/ui/States";
import { Stepper } from "@/components/ui/Stepper";
import { cn } from "@/lib/cn";

type Planned = MealPlanEntry & { title: string };

/**
 * "Add to plan" from a recipe: the next seven days by meal, each free or showing what's there. Picking a filled
 * meal replaces it (and its leftovers). Servings start from the cook's default.
 */
export function AddToPlanDialog({ open, recipe, title, onClose }: { open: boolean; recipe: Recipe; title: string; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open ? <Body recipe={recipe} title={title} onDone={onClose} /> : null}
    </Dialog>
  );
}

function Body({ recipe, title, onDone }: { recipe: Recipe; title: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { language } = useLanguage();
  const today = toPlanDate(new Date());
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index)), [today]);
  const [planned, setPlanned] = useState<Planned[] | null>(null);
  const [meals, setMeals] = useState<PlanMeal[]>(["breakfast", "lunch", "dinner"]);
  const [servings, setServings] = useState(recipe.servings > 0 ? recipe.servings : 2);
  const [picked, setPicked] = useState<{ date: string; meal: PlanMeal } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void Promise.all([
      fetchMealPlanWithTitles(days[0], days[6], language).catch(() => [] as Planned[]),
      fetchMealPlanPrefs(userId).catch(() => null),
      fetchCloudKitchenProfile(userId).catch(() => null),
    ]).then(([rows, prefs, kitchen]) => {
      if (cancelled) return;
      setPlanned(rows);
      if (prefs) setMeals(mealsOfDay(prefs.meals, prefs.snacksPerDay));
      if (kitchen?.defaultServings) setServings(kitchen.defaultServings);
    });
    return () => {
      cancelled = true;
    };
  }, [days, language, userId]);

  const weekday = useMemo(() => new Intl.DateTimeFormat(language, { weekday: "short" }), [language]);
  const dayLabel = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    const date = new Date(y, m - 1, d, 12);
    return `${weekday.format(date)} ${d}`;
  };
  const at = (date: string, meal: PlanMeal) => planned?.find((row) => row.date === date && row.meal === meal) ?? null;
  const replacing = picked ? at(picked.date, picked.meal) : null;

  async function add() {
    if (!userId || !picked) {
      setError(t("plan.add.pick"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await replacePlanMeal(userId, { date: picked.date, meal: picked.meal, recipeId: recipe.id, servings }, replacing);
      showToast(t("plan.add.done"));
      onDone();
    } catch {
      setError(t("plan.add.failed"));
      setBusy(false);
    }
  }

  return (
    <DialogContent
      title={t("plan.add.title")}
      description={title}
      className="max-w-2xl"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost" trackId="plan.add.cancel" disabled={busy}>
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button trackId="plan.add.confirm" busy={busy} disabled={!picked} onClick={() => void add()}>
            {picked ? t("plan.add.addTo", { slot: `${dayLabel(picked.date)} · ${t(`plan.meals.${picked.meal}`)}` }) : t("plan.add.title")}
          </Button>
        </>
      }
    >
      {planned == null ? (
        <LoadingState className="min-h-48" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span id="plan-add-servings" className="text-[15px] font-semibold text-text">
              {t("plan.add.servings")}
            </span>
            <Stepper
              value={servings}
              onChange={setServings}
              min={1}
              max={48}
              labelledBy="plan-add-servings"
              decreaseLabel={t("plan.add.fewer")}
              increaseLabel={t("plan.add.more")}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] border-separate border-spacing-1.5 text-sm">
              <thead>
                <tr>
                  <th />
                  {meals.map((meal) => (
                    <th key={meal} scope="col" className="text-xs font-semibold tracking-wide text-muted uppercase">
                      {t(`plan.meals.${meal}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day}>
                    <th scope="row" className="pe-1 text-start font-semibold whitespace-nowrap text-text">
                      {day === today ? t("plan.today") : dayLabel(day)}
                    </th>
                    {meals.map((meal) => {
                      const row = at(day, meal);
                      const on = picked?.date === day && picked.meal === meal;
                      return (
                        <td key={meal}>
                          <button
                            type="button"
                            aria-pressed={on}
                            data-track={row ? "plan.add.replace_slot" : "plan.add.slot"}
                            aria-label={`${dayLabel(day)}, ${t(`plan.meals.${meal}`)}: ${row ? row.title : t("plan.add.free")}`}
                            onClick={() => setPicked({ date: day, meal })}
                            className={cn(
                              "flex h-11 w-full items-center justify-center gap-1 truncate rounded-xl px-2 text-[13px] transition-colors",
                              on
                                ? "bg-primary font-semibold text-on-primary"
                                : row
                                  ? "bg-element text-muted hover:bg-selected"
                                  : "border border-dashed border-border font-semibold text-primary-text hover:bg-element",
                            )}
                          >
                            {on ? title : row ? <span className="truncate">{row.title}</span> : <Plus aria-hidden className="h-4 w-4" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {replacing ? <p className="text-sm text-muted">{t("plan.add.replaces", { title: replacing.title })}</p> : null}
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </DialogContent>
  );
}
