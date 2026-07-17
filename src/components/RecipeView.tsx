import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { RecipeImage } from '@/components/RecipeImage';
import { SubstitutionModal } from '@/components/SubstitutionModal';
import { useThemePreference } from '@/hooks/useThemePreference';
import { formatQuantity } from '@/lib/formatQuantity';
import { ExtractedRecipe } from '@/lib/supabase/extractRecipe';
import { SubstitutionAlternative } from '@/lib/supabase/suggestSubstitution';
import { Ingredient } from '@/types/recipe';

/**
 * Scales ingredient quantities from `baseServings` to `target`, rounded to
 * 2 decimals. `baseServings` must be >= 1 — both the DB column and the
 * extraction pipeline guarantee this, but we clamp defensively here too
 * since a divide-by-zero would otherwise silently produce `Infinity`.
 */
function scaleIngredients(ingredients: Ingredient[], baseServings: number, target: number) {
  const factor = target / Math.max(1, baseServings);
  return ingredients.map((i) => ({
    ...i,
    quantity: Math.round(i.quantity * factor * 100) / 100,
  }));
}

interface RecipeViewProps {
  /**
   * Accepts either a saved `Recipe` (has id/user_id/created_at) or a
   * freshly extracted, not-yet-saved `ExtractedRecipe` — this component
   * never reads the save-only fields, so either shape works.
   */
  recipe: ExtractedRecipe;
  /** Rendered below Instructions — e.g. a Save button on the preview screen. */
  footer?: ReactNode;
}

/**
 * Full recipe display: badges, servings scaler, ingredients (with Swap),
 * and instructions. Shared by the preview screen (unsaved recipe) and the
 * saved recipe detail screen — see `RecipeViewProps.recipe` for why the
 * prop type is `ExtractedRecipe` rather than the full `Recipe`.
 */
export function RecipeView({ recipe, footer }: RecipeViewProps) {
  const { colors } = useThemePreference();
  const [servings, setServings] = useState(recipe.servings);
  const [baseIngredients, setBaseIngredients] = useState<Ingredient[]>(recipe.ingredients);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);

  const scaledIngredients = scaleIngredients(baseIngredients, recipe.servings, servings);
  const swapTarget = swapIndex != null ? scaledIngredients[swapIndex] : null;

  // `recipe.calories` is AI-estimated as a total for the recipe's original
  // servings (see the Gemini extraction prompt) — not per-serving, and not
  // per 100g. We reframe it as a per-serving figure here since that's the
  // basis people actually care about, and recompute the total live as the
  // servings stepper changes.
  const caloriesPerServing =
    recipe.calories != null ? Math.round(recipe.calories / Math.max(1, recipe.servings)) : null;
  const caloriesTotalForServings =
    caloriesPerServing != null ? Math.round(caloriesPerServing * servings) : null;

  function handleApplySubstitution(alternative: SubstitutionAlternative) {
    if (swapIndex == null) return;
    const factor = recipe.servings / servings;
    setBaseIngredients((prev) =>
      prev.map((ing, i) =>
        i === swapIndex
          ? {
              name: alternative.name,
              unit: alternative.unit,
              quantity: Math.round(alternative.quantity * factor * 100) / 100,
            }
          : ing,
      ),
    );
    setSwapIndex(null);
  }

  return (
    <ScrollView
      className="flex-1 bg-pinch-bg dark:bg-pinch-bg-dark"
      showsVerticalScrollIndicator={false}
    >
      {recipe.image_url ? (
        <RecipeImage uri={recipe.image_url} variant="hero" />
      ) : (
        <View className="h-44 items-center justify-center bg-pinch-primary-soft dark:bg-pinch-primary-soft-dark">
          <Ionicons name="restaurant" size={48} color={colors.primary} />
        </View>
      )}

      <View className="px-5 pt-5">
        <Text className="mb-3 text-2xl font-bold leading-8 text-pinch-dark dark:text-pinch-text-dark">
          {recipe.title}
        </Text>

        <View className="mb-5 flex-row flex-wrap gap-2">
          {caloriesPerServing != null && (
            <Badge label={`~${caloriesPerServing} cal/serving`} icon="flame-outline" />
          )}
          {recipe.estimated_time_minutes != null && (
            <Badge label={`${recipe.estimated_time_minutes} min`} icon="time-outline" />
          )}
          {recipe.cost_estimate && <Badge label={recipe.cost_estimate} icon="pricetag-outline" />}
          {recipe.effort_level && <Badge label={recipe.effort_level} icon="fitness-outline" />}
        </View>

        {recipe.extraction_status === 'partial' && (
          <View className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-[#3A3420]">
            <Text className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Couldn&apos;t find full details — here&apos;s what we found.
            </Text>
          </View>
        )}

        <View className="mb-5 rounded-3xl border border-pinch-border bg-pinch-surface p-4 dark:border-pinch-border-dark dark:bg-pinch-surface-dark">
          <Text className="mb-3 text-sm font-semibold text-pinch-dark dark:text-pinch-text-dark">
            Servings
          </Text>
          <View className="flex-row items-center gap-4">
            <Pressable
              className="h-11 w-11 items-center justify-center rounded-full bg-pinch-primary active:opacity-80 dark:bg-pinch-primary-dark"
              onPress={() => setServings((s) => Math.max(1, s - 1))}
            >
              <Ionicons name="remove" size={20} color="#fff" />
            </Pressable>
            <Text className="w-10 text-center text-2xl font-bold text-pinch-dark dark:text-pinch-text-dark">
              {servings}
            </Text>
            <Pressable
              className="h-11 w-11 items-center justify-center rounded-full bg-pinch-primary active:opacity-80 dark:bg-pinch-primary-dark"
              onPress={() => setServings((s) => s + 1)}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>
          {caloriesTotalForServings != null && (
            <Text className="mt-3 text-xs text-pinch-muted dark:text-pinch-muted-dark">
              ≈ {caloriesTotalForServings.toLocaleString()} cal total for {servings}{' '}
              {servings === 1 ? 'serving' : 'servings'}
            </Text>
          )}
        </View>

        {scaledIngredients.length > 0 && (
          <Section title="Ingredients">
            {scaledIngredients.map((ing, index) => (
              <View
                key={`${ing.name}-${index}`}
                className={`flex-row items-center justify-between py-3.5 ${
                  index < scaledIngredients.length - 1
                    ? 'border-b border-pinch-primary-soft dark:border-pinch-border-dark'
                    : ''
                }`}
              >
                <Text className="flex-1 pr-2 text-base text-pinch-dark dark:text-pinch-text-dark">
                  {ing.name}
                </Text>
                <Text className="text-sm text-pinch-muted dark:text-pinch-muted-dark">
                  {formatQuantity(ing.quantity, ing.unit)}
                </Text>
                <Pressable
                  className="ml-3 rounded-full bg-pinch-rose-soft px-3 py-1.5 dark:bg-pinch-rose-soft-dark"
                  onPress={() => setSwapIndex(index)}
                >
                  <Text className="text-xs font-semibold text-pinch-rose dark:text-pinch-rose-dark">
                    Swap
                  </Text>
                </Pressable>
              </View>
            ))}
          </Section>
        )}

        {recipe.instructions.length > 0 && (
          <Section title="Instructions">
            {recipe.instructions.map((step, index) => (
              <View
                key={step.step}
                className={`flex-row gap-3 py-3.5 ${
                  index < recipe.instructions.length - 1
                    ? 'border-b border-pinch-primary-soft dark:border-pinch-border-dark'
                    : ''
                }`}
              >
                <View className="mt-0.5 h-7 w-7 items-center justify-center rounded-full bg-pinch-primary dark:bg-pinch-primary-dark">
                  <Text className="text-xs font-bold text-white">{step.step}</Text>
                </View>
                <Text className="flex-1 text-base leading-6 text-pinch-muted dark:text-pinch-muted-dark">
                  {step.text}
                </Text>
              </View>
            ))}
          </Section>
        )}

        {footer}
      </View>

      <SubstitutionModal
        visible={swapIndex != null}
        ingredient={swapTarget ?? null}
        recipeTitle={recipe.title}
        otherIngredients={scaledIngredients
          .filter((_, i) => i !== swapIndex)
          .map((ing) => ing.name)}
        onClose={() => setSwapIndex(null)}
        onApply={handleApplySubstitution}
      />
    </ScrollView>
  );
}

function Badge({
  label,
  icon,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useThemePreference();
  return (
    <View className="flex-row items-center gap-1.5 rounded-full bg-pinch-primary-soft px-3 py-1.5 dark:bg-pinch-primary-soft-dark">
      <Ionicons name={icon} size={12} color={colors.primary} />
      <Text className="text-xs font-semibold text-pinch-primary dark:text-pinch-primary-dark">
        {label}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="mb-3 text-lg font-bold text-pinch-dark dark:text-pinch-text-dark">
        {title}
      </Text>
      <View className="rounded-3xl border border-pinch-border bg-pinch-surface px-4 dark:border-pinch-border-dark dark:bg-pinch-surface-dark">
        {children}
      </View>
    </View>
  );
}
