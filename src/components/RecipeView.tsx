import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { RecipeImage } from '@/components/RecipeImage';
import { RecipeVariantModal } from '@/components/RecipeVariantModal';
import { SubstitutionModal } from '@/components/SubstitutionModal';
import { useThemePreference } from '@/hooks/useThemePreference';
import { formatQuantity } from '@/lib/formatQuantity';
import { getCalorieDisplay } from '@/lib/recipeCalories';
import { getRecipeVariantLabel, RecipeVariantKey } from '@/lib/recipeVariants';
import { ExtractedRecipe } from '@/lib/supabase/extractRecipe';
import { SubstitutionAlternative } from '@/lib/supabase/suggestSubstitution';
import { TransformedRecipePayload } from '@/lib/supabase/transformRecipe';
import { Ingredient, Instruction } from '@/types/recipe';

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

interface RecipeContentSnapshot {
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  calories?: number;
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
  /** Fired when ingredients/instructions/servings/calories change (remix, swap, revert). */
  onContentChange?: (content: RecipeContentSnapshot) => void;
  /** Saved recipes only — shows a heart toggle in the header. */
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

/**
 * Full recipe display: compact header, servings scaler, ingredients (with Swap),
 * instructions, and AI remix options. Shared by preview and saved detail screens.
 */
export function RecipeView({
  recipe,
  footer,
  onContentChange,
  isFavorite,
  onToggleFavorite,
}: RecipeViewProps) {
  const { colors } = useThemePreference();
  const originalRef = useRef<RecipeContentSnapshot>({
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    calories: recipe.calories,
  });

  const [baseServings, setBaseServings] = useState(recipe.servings);
  const [baseIngredients, setBaseIngredients] = useState<Ingredient[]>(recipe.ingredients);
  const [baseInstructions, setBaseInstructions] = useState<Instruction[]>(recipe.instructions);
  const [calories, setCalories] = useState(recipe.calories);
  const [servings, setServings] = useState(recipe.servings);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [activeVariant, setActiveVariant] = useState<RecipeVariantKey | null>(null);
  const [variantSummary, setVariantSummary] = useState<string | null>(null);

  const scaledIngredients = scaleIngredients(baseIngredients, baseServings, servings);
  const swapTarget = swapIndex != null ? scaledIngredients[swapIndex] : null;
  const calorieDisplay = getCalorieDisplay(calories, baseServings, servings);

  useEffect(() => {
    onContentChange?.({
      servings: baseServings,
      ingredients: baseIngredients,
      instructions: baseInstructions,
      calories,
    });
  }, [baseServings, baseIngredients, baseInstructions, calories, onContentChange]);

  function handleApplySubstitution(alternative: SubstitutionAlternative) {
    if (swapIndex == null) return;
    const factor = baseServings / servings;
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

  function handleApplyVariant(result: TransformedRecipePayload, variant: RecipeVariantKey) {
    setBaseServings(result.servings);
    setBaseIngredients(result.ingredients);
    setBaseInstructions(result.instructions);
    setCalories(result.calories);
    setServings(result.servings);
    setActiveVariant(variant);
    setVariantSummary(result.summary);
  }

  function handleRevertVariant() {
    const original = originalRef.current;
    setBaseServings(original.servings);
    setBaseIngredients(original.ingredients);
    setBaseInstructions(original.instructions);
    setCalories(original.calories);
    setServings(original.servings);
    setActiveVariant(null);
    setVariantSummary(null);
  }

  return (
    <ScrollView
      className="flex-1 bg-pinch-bg dark:bg-pinch-bg-dark"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View className="px-5 pt-4">
        <View className="mb-4 rounded-3xl border border-pinch-border bg-pinch-surface p-4 dark:border-pinch-border-dark dark:bg-pinch-surface-dark">
          <View className="flex-row items-start gap-3.5">
            <View className="flex-1">
              <View className="flex-row items-start gap-2">
                <Text className="flex-1 text-2xl font-bold leading-8 text-pinch-dark dark:text-pinch-text-dark">
                  {recipe.title}
                </Text>
                {onToggleFavorite != null && (
                  <TouchableOpacity
                    onPress={onToggleFavorite}
                    hitSlop={12}
                    activeOpacity={0.6}
                    className="mt-0.5 px-1"
                    accessibilityLabel={
                      isFavorite ? 'Remove from favorites' : 'Add to favorites'
                    }
                  >
                    <Ionicons
                      name={isFavorite ? 'heart' : 'heart-outline'}
                      size={26}
                      color={isFavorite ? colors.accent : colors.textSecondary}
                    />
                  </TouchableOpacity>
                )}
              </View>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {calorieDisplay != null && (
                  <Badge label={`~${calorieDisplay.perServing} cal/serving`} icon="flame-outline" />
                )}
                {recipe.estimated_time_minutes != null && (
                  <Badge label={`${recipe.estimated_time_minutes} min`} icon="time-outline" />
                )}
                {recipe.cost_estimate && (
                  <Badge label={recipe.cost_estimate} icon="pricetag-outline" />
                )}
                {recipe.effort_level && (
                  <Badge label={recipe.effort_level} icon="fitness-outline" />
                )}
              </View>
            </View>

            {recipe.image_url ? (
              <View className="rounded-2xl border border-pinch-primary-soft dark:border-pinch-border-dark">
                <RecipeImage uri={recipe.image_url} variant="compact" />
              </View>
            ) : (
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-pinch-primary-soft dark:bg-pinch-primary-soft-dark">
                <Ionicons name="restaurant" size={26} color={colors.primary} />
              </View>
            )}
          </View>
        </View>

        {activeVariant != null && (
          <View className="mb-4 rounded-2xl border border-pinch-primary-soft bg-pinch-primary-soft px-4 py-3 dark:border-pinch-primary-soft-dark dark:bg-pinch-primary-soft-dark">
            <Text className="text-sm font-semibold text-pinch-primary dark:text-pinch-primary-dark">
              {getRecipeVariantLabel(activeVariant)} version
            </Text>
            {variantSummary != null && (
              <Text className="mt-1 text-sm leading-5 text-pinch-dark dark:text-pinch-text-dark">
                {variantSummary}
              </Text>
            )}
            <Pressable onPress={handleRevertVariant} className="mt-2 active:opacity-70">
              <Text className="text-sm font-semibold text-pinch-rose dark:text-pinch-rose-dark">
                Revert to original
              </Text>
            </Pressable>
          </View>
        )}

        {recipe.extraction_status === 'partial' && (
          <View className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-[#3A3420]">
            <Text className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Couldn&apos;t find full details — here&apos;s what we found.
            </Text>
          </View>
        )}

        <Pressable
          onPress={() => setVariantModalOpen(true)}
          className="mb-5 flex-row items-center justify-center gap-2 rounded-3xl border border-pinch-rose-soft bg-pinch-rose-soft py-3.5 active:opacity-90 dark:border-pinch-rose-soft-dark dark:bg-pinch-rose-soft-dark"
        >
          <Ionicons name="color-wand-outline" size={18} color={colors.accent} />
          <Text className="text-sm font-bold text-pinch-dark dark:text-pinch-text-dark">
            Remix this recipe
          </Text>
        </Pressable>

        <View className="mb-5 flex-row items-center justify-between rounded-3xl border border-pinch-border bg-pinch-surface px-4 py-3.5 dark:border-pinch-border-dark dark:bg-pinch-surface-dark">
          <View>
            <Text className="text-sm font-semibold text-pinch-dark dark:text-pinch-text-dark">
              Servings
            </Text>
            {calorieDisplay != null && (
              <Text className="mt-0.5 text-xs text-pinch-muted dark:text-pinch-muted-dark">
                ≈ {calorieDisplay.total.toLocaleString()} cal total
              </Text>
            )}
          </View>
          <View className="flex-row items-center gap-3">
            <StepperButton icon="remove" onPress={() => setServings((s) => Math.max(1, s - 1))} />
            <Text className="min-w-[28px] text-center text-xl font-bold text-pinch-dark dark:text-pinch-text-dark">
              {servings}
            </Text>
            <StepperButton icon="add" onPress={() => setServings((s) => s + 1)} />
          </View>
        </View>

        {scaledIngredients.length > 0 && (
          <Section title="Ingredients" count={scaledIngredients.length}>
            {scaledIngredients.map((ing, index) => (
              <View
                key={`${ing.name}-${index}`}
                className={`flex-row items-center justify-between py-3.5 ${
                  index < scaledIngredients.length - 1
                    ? 'border-b border-pinch-primary-soft dark:border-pinch-border-dark'
                    : ''
                }`}
              >
                <Text className="flex-1 pr-2 text-base font-medium text-pinch-dark dark:text-pinch-text-dark">
                  {ing.name}
                </Text>
                <Text className="text-sm tabular-nums text-pinch-muted dark:text-pinch-muted-dark">
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

        {baseInstructions.length > 0 && (
          <Section title="Instructions" count={baseInstructions.length}>
            {baseInstructions.map((step, index) => (
              <View
                key={`${step.step}-${index}`}
                className={`flex-row gap-3 py-3.5 ${
                  index < baseInstructions.length - 1
                    ? 'border-b border-pinch-primary-soft dark:border-pinch-border-dark'
                    : ''
                }`}
              >
                <View className="mt-0.5 h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pinch-primary dark:bg-pinch-primary-dark">
                  <Text className="text-xs font-bold text-white">{step.step}</Text>
                </View>
                <Text className="flex-1 text-base leading-6 text-pinch-dark dark:text-pinch-text-dark">
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

      <RecipeVariantModal
        visible={variantModalOpen}
        title={recipe.title}
        servings={baseServings}
        ingredients={baseIngredients}
        instructions={baseInstructions}
        calories={calories}
        onClose={() => setVariantModalOpen(false)}
        onApply={handleApplyVariant}
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

function StepperButton({
  icon,
  onPress,
}: {
  icon: 'add' | 'remove';
  onPress: () => void;
}) {
  return (
    <Pressable
      className="h-9 w-9 items-center justify-center rounded-full bg-pinch-primary active:opacity-80 dark:bg-pinch-primary-dark"
      onPress={onPress}
    >
      <Ionicons name={icon} size={18} color="#fff" />
    </Pressable>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <View className="mb-5">
      <View className="mb-3 flex-row items-baseline gap-2">
        <Text className="text-lg font-bold text-pinch-dark dark:text-pinch-text-dark">{title}</Text>
        {count != null && (
          <Text className="text-sm font-medium text-pinch-muted dark:text-pinch-muted-dark">
            {count} {count === 1 ? 'item' : 'items'}
          </Text>
        )}
      </View>
      <View className="rounded-3xl border border-pinch-border bg-pinch-surface px-4 dark:border-pinch-border-dark dark:bg-pinch-surface-dark">
        {children}
      </View>
    </View>
  );
}
