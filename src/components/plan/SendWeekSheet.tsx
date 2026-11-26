import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { recipeIngredientsIn } from '@shared/lib/cachedTranslation';
import { scaleIngredients } from '@shared/lib/ingredientAmounts';
import { isAtHome } from '@shared/lib/mealPlan/planner';
import { showToast } from '@shared/lib/toast';
import { PLAN_MEALS, type MealPlanEntry } from '@shared/types/mealPlan';
import type { Ingredient, Recipe } from '@shared/types/recipe';

import { KitIcon } from '@/components/ui/tokens';
import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useThemePreference } from '@/hooks/useThemePreference';

/** `original`: the ingredient's name in the recipe's own language, when `ingredient` is from a translation. */
type Line = { key: string; entry: MealPlanEntry; ingredient: Ingredient; original: string | null };

/**
 * "Send to list" on the phone (PIN-77): what the meals still to cook need, at the planned servings, with what is at
 * home left unticked. Leftovers add nothing. Same name and unit stack into one line on the list. Names are in the
 * app language when the recipe has a saved translation into it; what's at home matches either name.
 */
export function SendWeekSheet({
  visible,
  onClose,
  entries,
  recipeFor,
  homeNames,
  dayLabel,
}: {
  visible: boolean;
  onClose: () => void;
  entries: MealPlanEntry[];
  recipeFor: (entry: MealPlanEntry) => Recipe | null;
  homeNames: string[];
  dayLabel: (date: string) => string;
}) {
  const { t } = useTranslation();
  return (
    <SheetModal visible={visible} onClose={onClose} title={t('plan.send.title')} trackId="plan.send">
      {visible ? <Body entries={entries} recipeFor={recipeFor} homeNames={homeNames} dayLabel={dayLabel} onDone={onClose} /> : null}
    </SheetModal>
  );
}

function Body({
  entries,
  recipeFor,
  homeNames,
  dayLabel,
  onDone,
}: {
  entries: MealPlanEntry[];
  recipeFor: (entry: MealPlanEntry) => Recipe | null;
  homeNames: string[];
  dayLabel: (date: string) => string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { addFromRecipes } = useShoppingList();
  const { language } = useLanguagePreference();
  const sections = useMemo(
    () =>
      entries
        .filter((entry) => !entry.leftoverOf && !entry.cookedAt)
        .sort((a, b) => a.date.localeCompare(b.date) || PLAN_MEALS.indexOf(a.meal) - PLAN_MEALS.indexOf(b.meal))
        .flatMap((entry) => {
          const recipe = recipeFor(entry);
          if (!recipe) return [];
          const own = recipeIngredientsIn(recipe, language);
          const originals = recipe.ingredients ?? [];
          const lines: Line[] = scaleIngredients(own.ingredients, recipe.servings, entry.servings)
            .map((ingredient, index) => ({
              key: `${entry.id}:${index}`,
              entry,
              ingredient,
              original: own.translated && originals.length === own.ingredients.length ? originals[index]?.name ?? null : null,
            }))
            .filter((line) => line.ingredient.name?.trim());
          return lines.length > 0 ? [{ entry, title: `${dayLabel(entry.date)} · ${t(`plan.meals.${entry.meal}`)} · ${recipe.display_title?.trim() || recipe.title}`, lines }] : [];
        }),
    [dayLabel, entries, language, recipeFor, t],
  );
  const all = sections.flatMap((section) => section.lines);
  const atHome = (line: Line) =>
    isAtHome(line.ingredient.name, homeNames) || (line.original != null && isAtHome(line.original, homeNames));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(all.filter((line) => !atHome(line)).map((line) => line.key)));
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await addFromRecipes(
        sections.map((section) => ({
          id: section.entry.recipeId,
          ingredients: section.lines
            .filter((line) => selected.has(line.key))
            .map((line) => ({ name: line.ingredient.name, quantity: line.ingredient.quantity, unit: line.ingredient.unit ?? '' })),
        })),
      );
      showToast(t('plan.send.done'));
      onDone();
    } catch {
      showToast(t('plan.send.failed'), 'error');
      setBusy(false);
    }
  }

  if (sections.length === 0) {
    return (
      <Text variant="bodySmall" tone="muted" align="center" style={{ paddingVertical: 24 }}>
        {t('plan.send.nothing')}
      </Text>
    );
  }

  return (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <Text variant="bodySmall" tone="muted">
        {t('plan.send.hint')}
      </Text>
      {sections.map((section) => (
        <View key={section.entry.id} style={{ gap: 2 }}>
          <Text variant="caption" tone="muted" weight="semibold" style={{ marginBottom: 4 }}>
            {section.title.toUpperCase()}
          </Text>
          {section.lines.map((line) => {
            const on = selected.has(line.key);
            return (
              <Pressable
                key={line.key}
                trackId="plan.send.toggle"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  const next = new Set(selected);
                  if (on) next.delete(line.key);
                  else next.add(line.key);
                  setSelected(next);
                }}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    borderWidth: 2,
                    borderColor: on ? colors.primary : colors.border,
                    backgroundColor: on ? colors.primary : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {on ? <KitIcon icon="checkmark" color={colors.onPrimary} size={15} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="body" tone={on ? 'default' : 'muted'}>
                    {line.ingredient.name}
                  </Text>
                  {!on && atHome(line) ? (
                    <Text variant="caption" tone="success" weight="semibold">
                      {t('plan.atHome')}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Button trackId="plan.send.add" busy={busy} fullWidth disabled={selected.size === 0} onPress={() => void send()}>
        {t('plan.send.add')}
      </Button>
    </View>
  );
}
