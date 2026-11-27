"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { LibraryOnlyStatus } from "@shared/lib/mealPlan/fillWeek";
import { mealsOfDay } from "@shared/lib/mealPlan/week";
import { showToast } from "@shared/lib/toast";
import { MAIN_MEALS, type MainMeal, type MealPlanPrefs, type PlanAdjust, type PlanMeal, type SnacksPerDay } from "@shared/types/mealPlan";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import type { FillOutcome, FillRequest } from "@/lib/plan/usePlan";

type AdjustKey = Exclude<keyof PlanAdjust, "skipFoods">;
const ADJUST_KEYS: AdjustKey[] = ["quickWeeknights", "cheaper", "moreProtein", "useUpFridge", "fewerNew"];

/**
 * "Plan my week": which days and meals, snacks, the Hub and leftovers, and the Adjust options. Filling fills empty
 * meals; once a week has meals, "Reshuffle" also replaces the ones that aren't locked or cooked. The choices are
 * remembered on the account.
 */
export function PlanMyWeekDialog({
  open,
  onOpenChange,
  days,
  dayLabel,
  prefs,
  following,
  libraryStatus,
  hasMeals,
  onSavePrefs,
  onFill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Days that can still be planned (today and later). */
  days: string[];
  dayLabel: (date: string) => string;
  prefs: MealPlanPrefs;
  /** The cook's diets and allergies, as chips. */
  following: { label: string; allergy: boolean }[];
  libraryStatus: (meals: PlanMeal[]) => LibraryOnlyStatus;
  hasMeals: boolean;
  onSavePrefs: (prefs: MealPlanPrefs) => Promise<void>;
  onFill: (request: FillRequest) => Promise<FillOutcome>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <Body
          days={days}
          dayLabel={dayLabel}
          prefs={prefs}
          following={following}
          libraryStatus={libraryStatus}
          hasMeals={hasMeals}
          onSavePrefs={onSavePrefs}
          onFill={onFill}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function Body({
  days,
  dayLabel,
  prefs,
  following,
  libraryStatus,
  hasMeals,
  onSavePrefs,
  onFill,
  onDone,
}: {
  days: string[];
  dayLabel: (date: string) => string;
  prefs: MealPlanPrefs;
  following: { label: string; allergy: boolean }[];
  libraryStatus: (meals: PlanMeal[]) => LibraryOnlyStatus;
  hasMeals: boolean;
  onSavePrefs: (prefs: MealPlanPrefs) => Promise<void>;
  onFill: (request: FillRequest) => Promise<FillOutcome>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [chosenDays, setChosenDays] = useState<string[]>(days);
  const [meals, setMeals] = useState<MainMeal[]>(prefs.meals);
  const [snacks, setSnacks] = useState<SnacksPerDay>(prefs.snacksPerDay);
  const [useHub, setUseHub] = useState(prefs.useHub);
  const [leftovers, setLeftovers] = useState(prefs.leftovers);
  const [adjust, setAdjust] = useState<Record<AdjustKey, boolean>>({ quickWeeknights: false, cheaper: false, moreProtein: false, useUpFridge: false, fewerNew: false });
  const [skipFoods, setSkipFoods] = useState<string[]>([]);
  const [skipDraft, setSkipDraft] = useState("");
  const [skipOpen, setSkipOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayMeals = useMemo(() => mealsOfDay(meals, snacks), [meals, snacks]);
  const status = useMemo(() => libraryStatus(dayMeals), [dayMeals, libraryStatus]);
  const hubForced = !status.allowed;

  async function run(mode: FillRequest["mode"]) {
    if (chosenDays.length === 0) {
      setError(t("plan.fill.pickDay"));
      return;
    }
    setBusy(true);
    setError(null);
    const nextPrefs: MealPlanPrefs = { meals, snacksPerDay: snacks, useHub, leftovers };
    void onSavePrefs(nextPrefs);
    try {
      const outcome = await onFill({
        days: [...chosenDays].sort(),
        meals: dayMeals,
        mode,
        useHub: useHub || hubForced,
        leftovers,
        adjust: { ...adjust, skipFoods },
      });
      if (outcome.filled === 0 && outcome.empty === 0) {
        setError(t("plan.fill.nothingToFill"));
        setBusy(false);
        return;
      }
      showToast(outcome.empty > 0 ? t("plan.fill.someEmpty") : t("plan.fill.done"), outcome.empty > 0 ? "info" : "success");
      onDone();
    } catch {
      setError(t("plan.fill.failed"));
      setBusy(false);
    }
  }

  function addSkip() {
    const food = skipDraft.trim().slice(0, 30);
    if (food && !skipFoods.some((item) => item.toLowerCase() === food.toLowerCase())) setSkipFoods([...skipFoods, food].slice(0, 5));
    setSkipDraft("");
  }

  const footer = (
    <>
      <DialogClose asChild>
        <Button variant="ghost" trackId="plan.fill.cancel" disabled={busy}>
          {t("common.cancel")}
        </Button>
      </DialogClose>
      {hasMeals ? (
        <Button variant="outline" trackId="plan.fill.reshuffle" disabled={busy} onClick={() => void run("reshuffle")}>
          {t("plan.fill.reshuffle")}
        </Button>
      ) : null}
      <Button trackId="plan.fill.fill" busy={busy} onClick={() => void run("fill")}>
        {t("plan.fill.fill")}
      </Button>
    </>
  );

  return (
    <DialogContent title={t("plan.fill.title")} className="max-w-xl" footer={footer}>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{t("plan.fill.days")}</h3>
          <div className="flex flex-wrap gap-2">
            {days.map((day) => {
              const on = chosenDays.includes(day);
              return (
                <Chip
                  key={day}
                  size="sm"
                  selected={on}
                  trackId="plan.fill.day"
                  onClick={() => setChosenDays(on ? chosenDays.filter((d) => d !== day) : [...chosenDays, day])}
                >
                  {dayLabel(day)}
                </Chip>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{t("plan.fill.meals")}</h3>
          <div className="flex flex-wrap gap-2">
            {MAIN_MEALS.map((meal) => {
              const on = meals.includes(meal);
              return (
                <Chip
                  key={meal}
                  size="sm"
                  selected={on}
                  trackId={`plan.fill.meal.${meal}`}
                  onClick={() => setMeals(on ? (meals.length > 1 ? meals.filter((m) => m !== meal) : meals) : MAIN_MEALS.filter((m) => m === meal || meals.includes(m)))}
                >
                  {t(`plan.meals.${meal}`)}
                </Chip>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{t("plan.fill.snacks")}</h3>
            <span className="text-xs text-muted">{t("plan.fill.remembered")}</span>
          </div>
          <SegmentedControl<"0" | "1" | "2">
            label={t("plan.fill.snacks")}
            fullWidth
            size="sm"
            value={String(snacks) as "0" | "1" | "2"}
            onChange={(value) => setSnacks(Number(value) as SnacksPerDay)}
            options={[
              { value: "0", label: t("plan.fill.noSnacks"), trackId: "plan.fill.snacks.none" },
              { value: "1", label: t("plan.fill.oneSnack"), trackId: "plan.fill.snacks.one" },
              { value: "2", label: t("plan.fill.twoSnacks"), trackId: "plan.fill.snacks.two" },
            ]}
          />
        </section>

        <section className="flex items-center gap-3 rounded-2xl bg-element px-3.5 py-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted">{t("plan.fill.following")}</span>
            {following.length === 0 ? <span className="text-muted">{t("plan.fill.noDiet")}</span> : null}
            {following.map((item) => (
              <span
                key={item.label}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  item.allergy ? "bg-danger-soft text-danger" : "border border-border bg-surface text-text",
                )}
              >
                {item.label}
              </span>
            ))}
          </div>
          <Link href="/settings/recipe" data-track="plan.fill.change_kitchen" className="shrink-0 text-sm font-semibold text-primary-text hover:underline">
            {t("plan.fill.change")}
          </Link>
        </section>

        <section className="flex flex-col divide-y divide-border">
          <Toggle
            label={t("plan.fill.useHub")}
            hint={hubForced ? t("plan.fill.hubLocked", { count: status.fitting }) : status.thinMeals.length > 0 && !useHub ? t("plan.fill.hubThin") : t("plan.fill.useHubHint")}
            checked={useHub || hubForced}
            disabled={hubForced}
            trackId="plan.fill.use_hub"
            onChange={setUseHub}
          />
          <Toggle
            label={t("plan.fill.leftovers")}
            hint={t("plan.fill.leftoversHint")}
            checked={leftovers}
            trackId="plan.fill.leftovers"
            onChange={setLeftovers}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{t("plan.fill.adjust")}</h3>
          <div className="flex flex-wrap gap-2">
            {ADJUST_KEYS.map((key) => (
              <Chip
                key={key}
                size="sm"
                selected={adjust[key]}
                trackId={`plan.adjust.${key}`}
                onClick={() => setAdjust({ ...adjust, [key]: !adjust[key] })}
              >
                {t(`plan.fill.${key}`)}
              </Chip>
            ))}
            {skipFoods.map((food) => (
              <Chip key={food} size="sm" selected trackId="plan.adjust.skip_remove" aria-label={t("plan.fill.skipRemove", { food })} onClick={() => setSkipFoods(skipFoods.filter((item) => item !== food))}>
                {food}
                <X aria-hidden className="h-3.5 w-3.5" />
              </Chip>
            ))}
            {skipOpen ? (
              <form
                className="flex items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  addSkip();
                }}
              >
                <input
                  autoFocus
                  value={skipDraft}
                  maxLength={30}
                  onChange={(event) => setSkipDraft(event.target.value)}
                  aria-label={t("plan.fill.skipLabel")}
                  placeholder={t("plan.fill.skipPlaceholder")}
                  className="h-10 w-40 rounded-xl border border-border bg-surface px-3 text-sm text-text focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
                <Button type="submit" size="sm" variant="secondary" trackId="plan.adjust.skip_add">
                  {t("plan.fill.skipAdd")}
                </Button>
              </form>
            ) : skipFoods.length < 5 ? (
              <Chip size="sm" trackId="plan.adjust.skip_open" onClick={() => setSkipOpen(true)}>
                {`+ ${t("plan.fill.skipFood")}`}
              </Chip>
            ) : null}
          </div>
        </section>

        <p className="text-sm text-muted">{t("plan.fill.lockedStay")}</p>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </DialogContent>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  trackId,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  trackId: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-3 py-3", disabled && "cursor-default")}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-text">{label}</span>
        <span className="text-sm text-muted">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        data-track={trackId}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors after:absolute after:-inset-2 disabled:opacity-60",
          checked ? "bg-primary" : "bg-text/25",
        )}
      >
        <span
          aria-hidden
          className={cn("absolute top-1 h-5 w-5 rounded-full transition-[inset-inline-start] duration-150", checked ? "start-6 bg-on-primary" : "start-1 bg-surface")}
        />
      </button>
    </label>
  );
}
