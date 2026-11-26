"use client";

import { CalendarDays, ShoppingCart, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { translatedIngredientNames } from "@shared/lib/cachedTranslation";
import { planningWeeks, plannableDays, toPlanDate, weekStartFor, defaultPlanWeek, isPlannableWeek } from "@shared/lib/mealPlan/week";
import { showToast } from "@shared/lib/toast";
import { PLAN_MEALS, type MealPlanEntry, type PlanMeal } from "@shared/types/mealPlan";

import { useLanguage } from "@/components/LanguageProvider";
import { MealCard, reasonText } from "@/components/plan/MealCard";
import { PlanMyWeekDialog } from "@/components/plan/PlanMyWeekDialog";
import { SendWeekDialog } from "@/components/plan/SendWeekDialog";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { haveCount, slotKey } from "@/lib/plan/planModel";
import { usePlan } from "@/lib/plan/usePlan";

type View = "week" | "days";

/** The whole week fits from Tailwind's `xl` (80rem); narrower screens go day by day. */
const WIDE = "(min-width: 80rem)";
function subscribeWide(listener: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** A plan day ("2026-11-27") as a Date at local noon, for formatting. */
function asDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/**
 * The meal plan (PIN-77): this week or next, every day's meals, filled by "Plan my week" from the cook's recipes
 * and the Hub. A meal can be locked, swapped for another recipe, marked cooked or removed; "Send to list" puts what
 * the week still needs on the shopping list. Wide screens show the whole week at once; narrower ones go day by day.
 */
export function PlanPage() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const today = toPlanDate(new Date());
  const weekStart = weekStartFor(language);
  const { thisWeek, nextWeek } = planningWeeks(today, weekStart);
  const [which, setWhich] = useState<"this" | "next">(() => (defaultPlanWeek(today, weekStart).start === thisWeek.start ? "this" : "next"));
  const week = which === "this" ? thisWeek : nextWeek;
  const plan = usePlan(week);
  const [view, setView] = useState<View>("week");
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const showWeek = wide && view === "week";
  const [fillOpen, setFillOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);

  const weekdayFormat = useMemo(() => new Intl.DateTimeFormat(language, { weekday: "short" }), [language]);
  const dayFormat = useMemo(() => new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }), [language]);
  const longDayFormat = useMemo(() => new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long" }), [language]);
  const dayName = useCallback((day: string) => weekdayFormat.format(asDate(day)), [weekdayFormat]);
  const dayLabel = useCallback((day: string) => `${weekdayFormat.format(asDate(day))} ${asDate(day).getDate()}`, [weekdayFormat]);

  const entries = useMemo(() => plan.entries ?? [], [plan.entries]);
  const byKey = useMemo(() => new Map(entries.map((entry) => [slotKey(entry.date, entry.meal), entry])), [entries]);
  const editable = isPlannableWeek(week.start, today, weekStart);
  const openDays = editable ? plannableDays(week, today) : [];

  // The meals shown each day: the ones the cook plans, plus any meal that already has something in it.
  const shownMeals: PlanMeal[] = useMemo(() => {
    const wanted = new Set<PlanMeal>(plan.mealsOfDay());
    for (const entry of entries) wanted.add(entry.meal);
    return PLAN_MEALS.filter((meal) => wanted.has(meal));
    // The meals depend on the cook's choices; `plan.mealsOfDay` is a new function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, plan.prefs]);

  const following = useMemo(() => {
    const profile = plan.profile;
    if (!profile) return [];
    return [
      ...profile.diets.map((diet) => ({ label: t(`recipe.variants.${diet}.label`), allergy: false })),
      ...profile.allergies.map((key) => ({ label: t(`avoid.allergens.${key}`), allergy: true })),
      ...profile.otherAllergies.map((item) => ({ label: item, allergy: true })),
    ];
  }, [plan.profile, t]);

  async function guarded(key: string, run: () => Promise<unknown>) {
    setBusySlot(key);
    try {
      await run();
    } catch {
      showToast(t("plan.saveFailed"), "error");
    } finally {
      setBusySlot(null);
    }
  }

  function card(day: string, meal: PlanMeal, layout: "week" | "row") {
    const entry = byKey.get(slotKey(day, meal)) ?? null;
    const recipe = entry ? plan.recipeFor(entry) : null;
    const key = slotKey(day, meal);
    const readOnly = !editable || day < today;
    let have: string | null = null;
    if (recipe && entry && !entry.leftoverOf && plan.homeNames.length > 0) {
      const count = haveCount((recipe.ingredients ?? []).map((ing) => ing.name), plan.homeNames, translatedIngredientNames(recipe, language));
      // "You have 0 of 3" says nothing; only what is at home is worth a line.
      if (count.total > 0 && count.have > 0) have = count.have === count.total ? t("plan.haveAll") : t("plan.have", count);
    }
    const leftoverSource = entry?.leftoverOf ? entries.find((row) => row.id === entry.leftoverOf) : null;
    const note = leftoverSource
      ? t(meal === "snack_am" || meal === "snack_pm" ? "plan.reason.batch" : "plan.reason.leftovers", { day: dayName(leftoverSource.date) })
      : reasonText(plan.reasons[key], t, dayName);
    return (
      <MealCard
        key={key}
        meal={meal}
        entry={entry}
        recipe={recipe}
        note={note}
        have={have}
        layout={layout}
        tonight={day === today && meal === "dinner" && entry != null && !entry.leftoverOf}
        readOnly={readOnly}
        busy={busySlot === key}
        onLock={() => entry && void guarded(key, () => plan.change(entry, { locked: !entry.locked }))}
        onShuffle={() => entry && void guarded(key, () => plan.shuffle(entry))}
        onCooked={() => entry && void guarded(key, () => plan.change(entry, { cookedAt: entry.cookedAt ? null : new Date().toISOString() }))}
        onRemove={() => entry && void guarded(key, () => plan.remove(entry))}
        onFill={() =>
          void guarded(key, () =>
            plan.fill(
              { days: [day], meals: [meal], mode: "fill", useHub: plan.prefs.useHub, leftovers: false, adjust: {} },
              { date: day, meal },
            ),
          )
        }
      />
    );
  }

  const header = (
    <PageHeader
      title={which === "this" ? t("plan.title") : t("plan.nextWeekTitle")}
      tabTitle={t("plan.tabTitle")}
      subtitle={t("plan.range", { from: dayFormat.format(asDate(week.days[0])), to: dayFormat.format(asDate(week.days[6])) })}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <Button variant="outline" trackId="plan.open_fill" disabled={plan.loading || openDays.length === 0} onClick={() => setFillOpen(true)}>
              <Sparkles aria-hidden className="h-[18px] w-[18px]" />
              {t("plan.planMyWeek")}
            </Button>
          ) : null}
          <Button trackId="plan.open_send" disabled={entries.length === 0} onClick={() => setSendOpen(true)}>
            <ShoppingCart aria-hidden className="h-[18px] w-[18px] rtl:-scale-x-100" />
            {t("plan.sendToList")}
          </Button>
        </div>
      }
    />
  );

  if (plan.failed) {
    return (
      <>
        {header}
        <ErrorState title={t("plan.loadFailed")} trackId="plan.load_error" onRetry={() => void plan.reload()} />
      </>
    );
  }

  if (plan.loading) {
    return (
      <>
        {header}
        <LoadingState className="min-h-64" />
      </>
    );
  }

  return (
    <>
      {header}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl<"this" | "next">
          label={t("plan.weekLabel")}
          size="sm"
          value={which}
          onChange={setWhich}
          options={[
            { value: "this", label: t("plan.thisWeek"), trackId: "plan.week.this" },
            { value: "next", label: t("plan.nextWeek"), trackId: "plan.week.next" },
          ]}
        />
        {wide ? (
          <SegmentedControl<View>
            label={t("plan.viewLabel")}
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "week", label: t("plan.viewWeek"), trackId: "plan.view.week" },
              { value: "days", label: t("plan.viewDays"), trackId: "plan.view.days" },
            ]}
          />
        ) : null}
      </div>

      {entries.length === 0 && editable ? (
        <EmptyState
          className="mb-6"
          icon={<CalendarDays aria-hidden className="h-7 w-7" />}
          title={t("plan.emptyTitle")}
          body={t("plan.emptyBody")}
          action={
            <Button trackId="plan.empty.plan" onClick={() => setFillOpen(true)}>
              <Sparkles aria-hidden className="h-[18px] w-[18px]" />
              {t("plan.planMyWeek")}
            </Button>
          }
        />
      ) : null}

      {/* Whole week: wide screens only. */}
      {showWeek ? (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1060px] gap-2.5" style={{ gridTemplateColumns: `5.5rem repeat(7, minmax(0, 1fr))` }}>
            <div />
            {week.days.map((day) => (
              <div
                key={day}
                className={cn(
                  "flex h-12 items-center justify-between rounded-2xl px-3",
                  day === today ? "bg-primary text-on-primary" : day < today ? "text-muted" : "bg-element text-text",
                )}
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[13px] font-semibold">{weekdayFormat.format(asDate(day))}</span>
                  <span className="font-display text-lg font-bold">{asDate(day).getDate()}</span>
                </span>
                {day === today ? <span className="text-[11px] font-semibold">{t("plan.today")}</span> : null}
              </div>
            ))}
            {shownMeals.map((meal) => (
              <MealRow key={meal} label={t(`plan.meals.${meal}`)}>
                {week.days.map((day) => (
                  <div key={day} className="min-w-0">
                    {card(day, meal, "week")}
                  </div>
                ))}
              </MealRow>
            ))}
          </div>
        </div>
      ) : (
        /* Day by day: always on narrower screens, or when chosen. */
        <div className="flex flex-col gap-4">
          {week.days.filter((day) => day >= today || entries.some((entry) => entry.date === day)).map((day) => (
            <section key={day} aria-label={longDayFormat.format(asDate(day))} className={cn("flex flex-col gap-2", day < today && "opacity-80")}>
              <h2 className="flex items-baseline gap-2 text-lg font-bold">
                {longDayFormat.format(asDate(day))}
                {day === today ? <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-on-primary">{t("plan.today")}</span> : null}
              </h2>
              <div className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">{shownMeals.map((meal) => card(day, meal, "row"))}</div>
            </section>
          ))}
        </div>
      )}

      <PlanMyWeekDialog
        open={fillOpen}
        onOpenChange={setFillOpen}
        days={openDays}
        dayLabel={dayLabel}
        prefs={plan.prefs}
        following={following}
        libraryStatus={plan.libraryStatus}
        hasMeals={entries.some((entry) => openDays.includes(entry.date))}
        onSavePrefs={plan.savePrefs}
        onFill={plan.fill}
      />
      <SendWeekDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        entries={entries.filter((entry: MealPlanEntry) => entry.date >= today)}
        recipeFor={plan.recipeFor}
        dayLabel={dayLabel}
      />
    </>
  );
}

/** A row of the whole-week grid: the meal's name, then its seven days. */
function MealRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="flex items-center text-[15px] font-semibold text-text font-display">{label}</div>
      {children}
    </>
  );
}
