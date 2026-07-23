import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { MeasurementToggle } from '@/components/MeasurementToggle';
import { AddToCollectionModal } from '@/components/AddToCollectionModal';
import { AddToShoppingListModal } from '@/components/AddToShoppingListModal';
import { EditTagsModal } from '@/components/EditTagsModal';
import { RecipeImage } from '@/components/RecipeImage';
import { RecipeVideoPanel, type RecipeVideoPanelHandle } from '@/components/RecipeVideoPanel';
import { RecipeTranslateModal } from '@/components/RecipeTranslateModal';
import { RecipeVariantModal } from '@/components/RecipeVariantModal';
import { SubstitutionModal } from '@/components/SubstitutionModal';
import { useCollections } from '@/hooks/useCollections';
import { useMeasurementPreference } from '@/hooks/useMeasurementPreference';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useThemePreference } from '@/hooks/useThemePreference';
import { setGuestRecipeTags } from '@/lib/guestRecipes';
import { applyMeasurementSystem } from '@/lib/convertMeasurement';
import { displayIngredientAmount } from '@/lib/displayIngredientAmount';
import { formatRecipeDuration } from '@/lib/formatRecipeDuration';
import { formatVideoTimestamp } from '@/lib/formatVideoTimestamp';
import { getRecipeVideoInfo } from '@/lib/recipeVideo';
import { getCalorieDisplay } from '@/lib/recipeCalories';
import {
  getRecipeLanguageLabel,
  isRtlRecipeLanguage,
  RecipeLanguageCode,
} from '@/lib/recipeLanguages';
import { normalizeRecipeTags } from '@/lib/recipeTags';
import { getRecipeVariantLabel, RecipeVariantKey } from '@/lib/recipeVariants';
import { ExtractedRecipe } from '@/lib/supabase/extractRecipe';
import { setRecipeTags } from '@/lib/supabase/recipes';
import { SubstitutionAlternative } from '@/lib/supabase/suggestSubstitution';
import { TranslatedRecipePayload } from '@/lib/supabase/translateRecipe';
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
  title: string;
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
  /** Optional trailing content inside the scroll (rarely needed). */
  footer?: ReactNode;
  /** Fired when title/ingredients/instructions/servings/calories change. */
  onContentChange?: (content: RecipeContentSnapshot) => void;
  /** Saved recipes only — shows a heart toggle in the header. */
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** When set, ingredients added to the shopping list keep this recipe as provenance. */
  recipeId?: string;
}

/**
 * Full recipe display: compact header, servings scaler, ingredients (with Swap),
 * instructions, remix, and on-demand translation. Shared by preview and detail.
 */
export function RecipeView({
  recipe,
  footer,
  onContentChange,
  isFavorite,
  onToggleFavorite,
  recipeId,
}: RecipeViewProps) {
  const { colors } = useThemePreference();
  const { system: measurementSystem } = useMeasurementPreference();
  const { addFromRecipe } = useShoppingList();
  const {
    collections,
    createCollection,
    setMembershipsForRecipe,
    collectionsForRecipe,
  } = useCollections();
  const originalRef = useRef<RecipeContentSnapshot>({
    title: recipe.title,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    calories: recipe.calories,
  });
  /** Untranslated content used as the source for every language switch. */
  const translationSourceRef = useRef<RecipeContentSnapshot | null>(null);

  const [title, setTitle] = useState(recipe.title);
  const [baseServings, setBaseServings] = useState(recipe.servings);
  const [baseIngredients, setBaseIngredients] = useState<Ingredient[]>(recipe.ingredients);
  const [baseInstructions, setBaseInstructions] = useState<Instruction[]>(recipe.instructions);
  const [calories, setCalories] = useState(recipe.calories);
  const [servings, setServings] = useState(recipe.servings);
  const [tags, setTags] = useState<string[]>(recipe.tags ?? []);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [shoppingListModalOpen, setShoppingListModalOpen] = useState(false);
  const [editTagsOpen, setEditTagsOpen] = useState(false);
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [translateModalOpen, setTranslateModalOpen] = useState(false);
  const [activeVariant, setActiveVariant] = useState<RecipeVariantKey | null>(null);
  const [variantSummary, setVariantSummary] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<RecipeLanguageCode | null>(null);
  const videoPanelRef = useRef<RecipeVideoPanelHandle>(null);

  const recipeCollections = recipeId ? collectionsForRecipe(recipeId) : [];

  const scaledIngredients = scaleIngredients(baseIngredients, baseServings, servings);
  const swapTarget = swapIndex != null ? scaledIngredients[swapIndex] : null;
  const calorieDisplay = getCalorieDisplay(calories, baseServings, servings);
  const textDirection = isRtlRecipeLanguage(activeLanguage) ? 'rtl' : 'ltr';

  useEffect(() => {
    onContentChange?.({
      title,
      servings: baseServings,
      ingredients: baseIngredients,
      instructions: baseInstructions,
      calories,
    });
  }, [title, baseServings, baseIngredients, baseInstructions, calories, onContentChange]);

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
    setActiveLanguage(null);
    translationSourceRef.current = null;
  }

  function handleRevertVariant() {
    const original = originalRef.current;
    setTitle(original.title);
    setBaseServings(original.servings);
    setBaseIngredients(original.ingredients);
    setBaseInstructions(original.instructions);
    setCalories(original.calories);
    setServings(original.servings);
    setActiveVariant(null);
    setVariantSummary(null);
    setActiveLanguage(null);
    translationSourceRef.current = null;
  }

  function handleApplyTranslation(result: TranslatedRecipePayload, language: RecipeLanguageCode) {
    if (!translationSourceRef.current) {
      translationSourceRef.current = {
        title,
        servings: baseServings,
        ingredients: baseIngredients,
        instructions: baseInstructions,
        calories,
      };
    }
    setTitle(result.title);
    setBaseIngredients(result.ingredients);
    setBaseInstructions(result.instructions);
    setActiveLanguage(language);
  }

  function handleShowOriginalLanguage() {
    const prior = translationSourceRef.current ?? originalRef.current;
    setTitle(prior.title);
    setBaseServings(prior.servings);
    setBaseIngredients(prior.ingredients);
    setBaseInstructions(prior.instructions);
    setCalories(prior.calories);
    setServings(prior.servings);
    setActiveLanguage(null);
    translationSourceRef.current = null;
  }

  const translationSource = translationSourceRef.current ?? {
    title,
    servings: baseServings,
    ingredients: baseIngredients,
    instructions: baseInstructions,
    calories,
  };

  const sourceVideo = getRecipeVideoInfo(recipe.original_url, recipe.platform);
  const showSideThumbnail = Boolean(recipe.image_url) && sourceVideo.mode === 'none';
  const hasStepTimestamps = useMemo(
    () => baseInstructions.some((step) => step.timestamp_seconds != null),
    [baseInstructions],
  );

  async function handleStepTimestamp(seconds: number) {
    if (sourceVideo.mode === 'none' || !recipe.original_url) return;
    videoPanelRef.current?.seekTo(seconds);
  }

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View className="px-5 pt-4">
        {sourceVideo.mode !== 'none' ? (
          <RecipeVideoPanel
            ref={videoPanelRef}
            originalUrl={recipe.original_url}
            platform={recipe.platform}
            posterUri={recipe.image_url}
          />
        ) : null}

        <View
          className="mb-4 rounded-3xl border p-4"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <View className="flex-row items-start gap-3.5">
            <View className="flex-1">
              <View className="flex-row items-start gap-2">
                <Text
                  className="flex-1 text-2xl font-bold leading-8"
                  style={{ color: colors.text, writingDirection: textDirection }}
                >
                  {title}
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
                      color={isFavorite ? colors.primary : colors.textSecondary}
                    />
                  </TouchableOpacity>
                )}
              </View>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {calorieDisplay != null && (
                  <Badge label={`~${calorieDisplay.perServing} cal/serving`} icon="flame-outline" />
                )}
                {recipe.estimated_time_minutes != null && (
                  <Badge
                    label={formatRecipeDuration(recipe.estimated_time_minutes)}
                    icon="time-outline"
                  />
                )}
                {recipe.cost_estimate && (
                  <Badge label={recipe.cost_estimate} icon="pricetag-outline" />
                )}
                {recipe.effort_level && (
                  <Badge label={recipe.effort_level} icon="fitness-outline" />
                )}
              </View>
              {(tags.length > 0 || recipeId) && (
                <View className="mt-2.5 flex-row flex-wrap items-center gap-1.5">
                  {tags.map((tag) => (
                    <Pressable
                      key={tag}
                      className="rounded-full border px-2.5 py-1 active:opacity-70"
                      style={{ borderColor: colors.border }}
                      onPress={() =>
                        router.push({ pathname: '/', params: { tag } })
                      }
                    >
                      <Text
                        className="text-[11px] font-medium capitalize"
                        style={{ color: colors.textSecondary }}
                      >
                        {tag}
                      </Text>
                    </Pressable>
                  ))}
                  {recipeId ? (
                    <Pressable
                      className="rounded-full px-2.5 py-1 active:opacity-70"
                      style={{ backgroundColor: colors.primarySoft }}
                      onPress={() => setEditTagsOpen(true)}
                    >
                      <Text
                        className="text-[11px] font-semibold"
                        style={{ color: colors.primary }}
                      >
                        {tags.length > 0 ? 'Edit tags' : 'Add tags'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
              {recipeId && recipeCollections.length > 0 ? (
                <View className="mt-2 flex-row flex-wrap gap-1.5">
                  {recipeCollections.map((collection) => (
                    <Pressable
                      key={collection.id}
                      className="flex-row items-center gap-1 rounded-full px-2.5 py-1 active:opacity-70"
                      style={{ backgroundColor: colors.accentSoft }}
                      onPress={() =>
                        router.push({
                          pathname: '/',
                          params: { collection: collection.id },
                        })
                      }
                    >
                      <Ionicons name="folder-outline" size={11} color={colors.accent} />
                      <Text className="text-[11px] font-medium" style={{ color: colors.accent }}>
                        {collection.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            {showSideThumbnail ? (
              <View className="rounded-2xl border" style={{ borderColor: colors.primarySoft }}>
                <RecipeImage uri={recipe.image_url!} variant="compact" />
              </View>
            ) : !recipe.image_url ? (
              <View
                className="h-16 w-16 items-center justify-center rounded-2xl"
                style={{ backgroundColor: colors.primarySoft }}
              >
                <Ionicons name="restaurant" size={26} color={colors.primary} />
              </View>
            ) : null}
          </View>
        </View>

        {activeLanguage != null && (
          <View
            className="mb-4 rounded-2xl border px-4 py-3"
            style={{ borderColor: colors.primarySoft, backgroundColor: colors.primarySoft }}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
              Showing {getRecipeLanguageLabel(activeLanguage)}
            </Text>
            <Pressable onPress={handleShowOriginalLanguage} className="mt-2 active:opacity-70">
              <Text className="text-sm font-semibold" style={{ color: colors.accent }}>
                Show original language
              </Text>
            </Pressable>
          </View>
        )}

        {activeVariant != null && (
          <View
            className="mb-4 rounded-2xl border px-4 py-3"
            style={{ borderColor: colors.primarySoft, backgroundColor: colors.primarySoft }}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
              {getRecipeVariantLabel(activeVariant)} version
            </Text>
            {variantSummary != null && (
              <Text className="mt-1 text-sm leading-5" style={{ color: colors.text }}>
                {variantSummary}
              </Text>
            )}
            <Pressable onPress={handleRevertVariant} className="mt-2 active:opacity-70">
              <Text className="text-sm font-semibold" style={{ color: colors.accent }}>
                Revert to original
              </Text>
            </Pressable>
          </View>
        )}

        {recipe.extraction_status === 'partial' && (
          <View
            className="mb-4 rounded-2xl border px-4 py-3"
            style={{ borderColor: colors.warningSoft, backgroundColor: colors.warningSoft }}
          >
            <Text className="text-sm font-medium" style={{ color: colors.warning }}>
              Couldn&apos;t find full details — here&apos;s what we found.
            </Text>
          </View>
        )}

        <View className="mb-5 flex-row gap-2.5">
          <Pressable
            onPress={() => setTranslateModalOpen(true)}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-3xl border py-3.5 active:opacity-90"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <Ionicons name="language-outline" size={18} color={colors.primary} />
            <Text className="text-sm font-bold" style={{ color: colors.text }}>
              Translate
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setVariantModalOpen(true)}
            className="flex-1 items-center justify-center gap-0.5 rounded-3xl border py-3 active:opacity-90"
            style={{ borderColor: colors.accentSoft, backgroundColor: colors.accentSoft }}
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="color-wand-outline" size={18} color={colors.accent} />
              <Text className="text-sm font-bold" style={{ color: colors.text }}>
                Remix
              </Text>
            </View>
          </Pressable>
        </View>

        {recipeId ? (
          <Pressable
            onPress={() => setCollectionModalOpen(true)}
            className="mb-5 flex-row items-center justify-center gap-2 rounded-3xl border py-3.5 active:opacity-90"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <Ionicons name="folder-outline" size={18} color={colors.accent} />
            <Text className="text-sm font-bold" style={{ color: colors.text }}>
              Add to collection
            </Text>
          </Pressable>
        ) : null}

        <View
          className="mb-5 flex-row items-center justify-between rounded-3xl border px-4 py-3.5"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <View>
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>
              Servings
            </Text>
            {calorieDisplay != null && (
              <Text className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                ≈ {calorieDisplay.total.toLocaleString()} cal total
              </Text>
            )}
          </View>
          <View className="flex-row items-center gap-3">
            <StepperButton icon="remove" onPress={() => setServings((s) => Math.max(1, s - 1))} />
            <Text
              className="min-w-[28px] text-center text-xl font-bold"
              style={{ color: colors.text }}
            >
              {servings}
            </Text>
            <StepperButton icon="add" onPress={() => setServings((s) => s + 1)} />
          </View>
        </View>

        {scaledIngredients.length > 0 && (
          <>
            <View className="mb-4">
              <MeasurementToggle hint />
            </View>
            <Section
            title="Ingredients"
            count={scaledIngredients.length}
            headerRight={
              <Pressable
                className="flex-row items-center gap-1 rounded-full px-3 py-1.5 active:opacity-80"
                style={{ backgroundColor: colors.primarySoft }}
                onPress={() => setShoppingListModalOpen(true)}
              >
                <Ionicons name="cart-outline" size={14} color={colors.primary} />
                <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                  Add to list
                </Text>
              </Pressable>
            }
          >
            {scaledIngredients.map((ing, index) => (
              <View
                key={`${ing.name}-${index}`}
                className={`flex-row items-center justify-between py-3.5 ${
                  index < scaledIngredients.length - 1 ? 'border-b' : ''
                }`}
                style={
                  index < scaledIngredients.length - 1
                    ? { borderColor: colors.primarySoft }
                    : undefined
                }
              >
                <Text
                  className="flex-1 pr-2 text-base font-medium"
                  style={{
                    color: colors.text,
                    writingDirection: textDirection,
                    textAlign: textDirection === 'rtl' ? 'right' : 'left',
                  }}
                >
                  {ing.name}
                </Text>
                <Text className="text-sm tabular-nums" style={{ color: colors.textSecondary }}>
                  {displayIngredientAmount(ing.quantity, ing.unit, {
                    system: measurementSystem,
                    language: activeLanguage,
                  })}
                </Text>
                <Pressable
                  className="ml-3 rounded-full px-3 py-1.5"
                  style={{ backgroundColor: colors.accentSoft }}
                  onPress={() => setSwapIndex(index)}
                >
                  <Text className="text-xs font-semibold" style={{ color: colors.accent }}>
                    Swap
                  </Text>
                </Pressable>
              </View>
            ))}
          </Section>
          </>
        )}

        {baseInstructions.length > 0 && (
          <Section
            title="Instructions"
            count={baseInstructions.length}
            headerRight={
              hasStepTimestamps ? (
                <Text className="text-[11px] font-medium" style={{ color: colors.textSecondary }}>
                  Tap a time to jump
                </Text>
              ) : undefined
            }
          >
            {baseInstructions.map((step, index) => (
              <View
                key={`${step.step}-${index}`}
                className={`flex-row gap-3 py-3.5 ${
                  index < baseInstructions.length - 1 ? 'border-b' : ''
                }`}
                style={{
                  flexDirection: textDirection === 'rtl' ? 'row-reverse' : 'row',
                  ...(index < baseInstructions.length - 1
                    ? { borderColor: colors.primarySoft }
                    : null),
                }}
              >
                <View
                  className="mt-0.5 h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text className="text-xs font-bold text-white">{step.step}</Text>
                </View>
                <View className="flex-1">
                  {step.timestamp_seconds != null ? (
                    <Pressable
                      onPress={() => void handleStepTimestamp(step.timestamp_seconds!)}
                      className="mb-1.5 flex-row items-center gap-1 self-start rounded-full px-2.5 py-1 active:opacity-80"
                      style={{ backgroundColor: colors.accentSoft }}
                      accessibilityRole="button"
                      accessibilityLabel={`Jump to step ${step.step} at ${formatVideoTimestamp(step.timestamp_seconds)}`}
                    >
                      <Ionicons name="play-circle" size={14} color={colors.accent} />
                      <Text className="text-xs font-bold tabular-nums" style={{ color: colors.accent }}>
                        {formatVideoTimestamp(step.timestamp_seconds)}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Text
                    className="text-base leading-6"
                    style={{
                      color: colors.text,
                      writingDirection: textDirection,
                      textAlign: textDirection === 'rtl' ? 'right' : 'left',
                    }}
                  >
                    {step.text}
                  </Text>
                </View>
              </View>
            ))}
          </Section>
        )}

        {footer}
      </View>

      <AddToShoppingListModal
        visible={shoppingListModalOpen}
        ingredients={scaledIngredients}
        language={activeLanguage}
        onClose={() => setShoppingListModalOpen(false)}
        onConfirm={async (selected) => {
          const normalized = selected.map((ing) => {
            const converted = applyMeasurementSystem(
              ing.quantity,
              ing.unit,
              measurementSystem,
            );
            return { ...ing, quantity: converted.quantity, unit: converted.unit };
          });
          const result = await addFromRecipe(normalized, recipeId);
          const dupNote =
            result.alreadyOnList.length === 0
              ? ''
              : result.alreadyOnList.length === 1
                ? `\n\n${result.alreadyOnList[0]} was already on your list — kept as a separate line.`
                : `\n\n${result.alreadyOnList.length} items were already on your list — kept as separate lines.`;
          Alert.alert(
            'Added to list',
            `${selected.length} item${selected.length === 1 ? '' : 's'} added.${dupNote}`,
          );
        }}
      />

      <EditTagsModal
        visible={editTagsOpen}
        tags={tags}
        onClose={() => setEditTagsOpen(false)}
        onSave={async (nextTags) => {
          if (!recipeId) return;
          const normalized = normalizeRecipeTags(nextTags);
          if (recipeId.startsWith('guest-')) {
            await setGuestRecipeTags(recipeId, normalized);
          } else {
            await setRecipeTags(recipeId, normalized);
          }
          setTags(normalized);
        }}
      />

      {recipeId ? (
        <AddToCollectionModal
          visible={collectionModalOpen}
          collections={collections}
          selectedIds={recipeCollections.map((c) => c.id)}
          onClose={() => setCollectionModalOpen(false)}
          onCreate={createCollection}
          onSave={async (ids) => {
            await setMembershipsForRecipe(recipeId, ids);
          }}
        />
      ) : null}

      <SubstitutionModal
        visible={swapIndex != null}
        ingredient={swapTarget ?? null}
        recipeTitle={title}
        otherIngredients={scaledIngredients
          .filter((_, i) => i !== swapIndex)
          .map((ing) => ing.name)}
        language={activeLanguage}
        onClose={() => setSwapIndex(null)}
        onApply={handleApplySubstitution}
      />

      <RecipeVariantModal
        visible={variantModalOpen}
        title={title}
        servings={baseServings}
        ingredients={baseIngredients}
        instructions={baseInstructions}
        calories={calories}
        onClose={() => setVariantModalOpen(false)}
        onApply={handleApplyVariant}
      />

      <RecipeTranslateModal
        visible={translateModalOpen}
        title={translationSource.title}
        ingredients={translationSource.ingredients}
        instructions={translationSource.instructions}
        activeLanguage={activeLanguage}
        onClose={() => setTranslateModalOpen(false)}
        onApply={handleApplyTranslation}
        onShowOriginal={handleShowOriginalLanguage}
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
    <View
      className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
      style={{ backgroundColor: colors.primarySoft }}
    >
      <Ionicons name={icon} size={12} color={colors.primary} />
      <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
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
  const { colors } = useThemePreference();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon === 'add' ? 'Increase servings' : 'Decrease servings'}
      className="h-9 w-9 items-center justify-center rounded-full active:opacity-80"
      style={{ backgroundColor: colors.primary }}
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
  headerRight,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  headerRight?: ReactNode;
}) {
  const { colors } = useThemePreference();
  return (
    <View className="mb-5">
      <View className="mb-3 flex-row items-center gap-2">
        <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
          <Text className="text-lg font-bold" style={{ color: colors.text }}>
            {title}
          </Text>
          {count != null && (
            <Text className="text-sm font-medium" style={{ color: colors.textSecondary }}>
              {count} {count === 1 ? 'item' : 'items'}
            </Text>
          )}
        </View>
        {headerRight}
      </View>
      <View
        className="rounded-3xl border px-4"
        style={{ borderColor: colors.border, backgroundColor: colors.surface }}
      >
        {children}
      </View>
    </View>
  );
}
