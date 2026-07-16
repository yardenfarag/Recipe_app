import { Image } from 'expo-image';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SubstitutionModal } from '@/components/SubstitutionModal';
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
  const [servings, setServings] = useState(recipe.servings);
  // Ingredients at `recipe.servings` (the baseline scaling anchors to).
  // Substitutions write back here so they survive future serving changes.
  const [baseIngredients, setBaseIngredients] = useState<Ingredient[]>(recipe.ingredients);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);

  const scaledIngredients = scaleIngredients(baseIngredients, recipe.servings, servings);
  const swapTarget = swapIndex != null ? scaledIngredients[swapIndex] : null;

  function handleApplySubstitution(alternative: SubstitutionAlternative) {
    if (swapIndex == null) return;
    // The alternative's quantity was suggested for the *currently displayed*
    // (scaled) amount — convert back to the recipe.servings baseline so it
    // scales correctly if the user changes servings again later.
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
    <ScrollView className="flex-1 bg-pinch-cream">
      {recipe.image_url && (
        <Image
          source={{ uri: recipe.image_url }}
          style={{ width: '100%', height: 240 }}
          contentFit="cover"
        />
      )}

      <View className="px-5 pt-5">
        <Text className="text-2xl font-bold text-pinch-dark mb-2">{recipe.title}</Text>

        <View className="flex-row flex-wrap gap-2 mb-5">
          {recipe.calories != null && <Badge label={`${recipe.calories} cal`} />}
          {recipe.estimated_time_minutes != null && (
            <Badge label={`${recipe.estimated_time_minutes} min`} />
          )}
          {recipe.cost_estimate && <Badge label={recipe.cost_estimate} />}
          {recipe.effort_level && <Badge label={recipe.effort_level} />}
        </View>

        {recipe.extraction_status === 'partial' && (
          <View className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-5">
            <Text className="text-sm text-yellow-800 font-medium">
              Couldn&apos;t find full details — here&apos;s what we found.
            </Text>
          </View>
        )}

        <View className="bg-white rounded-2xl p-4 mb-5 border border-gray-100">
          <Text className="text-sm font-semibold text-pinch-dark mb-3">Servings</Text>
          <View className="flex-row items-center gap-4">
            <Pressable
              className="w-10 h-10 rounded-full bg-pinch-orange items-center justify-center"
              onPress={() => setServings((s) => Math.max(1, s - 1))}
            >
              <Text className="text-white text-xl font-bold">−</Text>
            </Pressable>
            <Text className="text-2xl font-bold text-pinch-dark w-8 text-center">{servings}</Text>
            <Pressable
              className="w-10 h-10 rounded-full bg-pinch-orange items-center justify-center"
              onPress={() => setServings((s) => s + 1)}
            >
              <Text className="text-white text-xl font-bold">+</Text>
            </Pressable>
          </View>
        </View>

        {scaledIngredients.length > 0 && (
          <Section title="Ingredients">
            {scaledIngredients.map((ing, index) => (
              <View
                key={`${ing.name}-${index}`}
                className="flex-row justify-between items-center py-3 border-b border-gray-100"
              >
                <Text className="text-base text-pinch-dark flex-1">{ing.name}</Text>
                <Text className="text-sm text-gray-500">
                  {ing.quantity} {ing.unit}
                </Text>
                <Pressable
                  className="ml-3 px-2 py-1 rounded-full bg-green-50"
                  onPress={() => setSwapIndex(index)}
                >
                  <Text className="text-xs text-pinch-green font-medium">Swap</Text>
                </Pressable>
              </View>
            ))}
          </Section>
        )}

        {recipe.instructions.length > 0 && (
          <Section title="Instructions">
            {recipe.instructions.map((step) => (
              <View key={step.step} className="flex-row gap-3 mb-4">
                <View className="w-7 h-7 rounded-full bg-pinch-orange items-center justify-center mt-0.5">
                  <Text className="text-white text-xs font-bold">{step.step}</Text>
                </View>
                <Text className="flex-1 text-base text-gray-700 leading-6">{step.text}</Text>
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

/** Small pill used for calories/time/cost/effort at the top of the recipe. */
function Badge({ label }: { label: string }) {
  return (
    <View className="bg-orange-100 rounded-full px-3 py-1">
      <Text className="text-xs font-medium text-pinch-orange">{label}</Text>
    </View>
  );
}

/** Titled card wrapper used for the Ingredients and Instructions blocks. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="text-lg font-bold text-pinch-dark mb-3">{title}</Text>
      <View className="bg-white rounded-2xl px-4 border border-gray-100">{children}</View>
    </View>
  );
}
