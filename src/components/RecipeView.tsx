import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { MeasurementToggle } from '@/components/MeasurementToggle';
import { AddToCollectionModal } from '@/components/AddToCollectionModal';
import { AddToShoppingListModal } from '@/components/AddToShoppingListModal';
import { CookAlongVideoModal } from '@/components/CookAlongVideoModal';
import { CookMode } from '@/components/CookMode';
import { CookedNoteModal } from '@/components/CookedNoteModal';
import { CostMeter } from '@/components/CostEstimateDisplay';
import { EditTagsModal } from '@/components/EditTagsModal';
import { IngredientAmountText } from '@/components/IngredientAmountText';
import { RecipeImage } from '@/components/RecipeImage';
import { RecipeVideoPanel, type RecipeVideoPanelHandle } from '@/components/RecipeVideoPanel';
import { RecipeTranslateModal } from '@/components/RecipeTranslateModal';
import { RecipeVariantModal } from '@/components/RecipeVariantModal';
import { SubstitutionModal } from '@/components/SubstitutionModal';
import { TokenPurchaseSheet } from '@/components/TokenPurchaseSheet';
import { RecipeReadingWidth } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useCollections } from '@/hooks/useCollections';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useMeasurementPreference } from '@/hooks/useMeasurementPreference';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useAuth } from '@/hooks/useAuth';
import { setGuestRecipeTags } from '@/lib/guestRecipes';
import { pickIngredientAmount, scaleIngredient, scaleIngredients } from '@/lib/ingredientAmounts';
import { isRtlAppLanguage } from '@/lib/appLanguages';
import { confirmAction } from '@/lib/confirmAction';
import { clearExtractionRequestId } from '@/lib/extractionRequestId';
import { resolveCulinaryLanguage } from '@/lib/culinaryUnits';
import { displayIngredientAmount, displayedAmountIsPinch, ingredientAmountIsUnknown, recipeHasUnknownAmounts } from '@/lib/displayIngredientAmount';
import { formatCookedDate } from '@/lib/formatCookedDate';
import { COST_I18N_KEYS, costFilledCount } from '@/lib/formatCostEstimate';
import { formatRecipeDuration } from '@/lib/formatRecipeDuration';
import { formatVideoTimestamp } from '@/lib/formatVideoTimestamp';
import { getRecipeVideoInfo } from '@/lib/recipeVideo';
import { getCalorieDisplay } from '@/lib/recipeCalories';
import { recipeIsInvented } from '@/lib/recipeOrigin';
import {
  isRecipeLanguageCode,
  isRtlRecipeLanguage,
  RecipeLanguageCode,
} from '@/lib/recipeLanguages';
import { resolveRecipeSourceLanguage } from '@/lib/recipeSourceLanguage';
import { normalizeRecipeTags, translateRecipeTag } from '@/lib/recipeTags';
import { RecipeVariantKey } from '@/lib/recipeVariants';
import { recipeSourceShareUrl, shareRecipe } from '@/lib/shareRecipe';
import { ExtractedRecipe } from '@/lib/supabase/extractRecipe';
import { setRecipeTags } from '@/lib/supabase/recipes';
import { repairRecipe, repairRequestKey, settleRepairRecipe } from '@/lib/supabase/repairRecipe';
import type { RepairedRecipePayload } from '@/lib/supabase/repairRecipe';
import { SubstitutionAlternative } from '@/lib/supabase/suggestSubstitution';
import { TranslatedRecipePayload } from '@/lib/supabase/translateRecipe';
import { TransformedRecipePayload } from '@/lib/supabase/transformRecipe';
import { Ingredient, Instruction, Recipe, RecipeTranslationContent } from '@/types/recipe';

interface RecipeContentSnapshot {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  calories?: number;
  kitchen_adapted_summary?: string | null;
  kitchen_original?: Recipe['kitchen_original'] | null;
}

interface RecipeViewProps {
  /**
   * Accepts either a saved `Recipe` (has id/user_id/created_at) or a
   * freshly extracted, not-yet-saved `ExtractedRecipe` — this component
   * never reads the save-only fields, so either shape works.
   * Always pass **canonical** (source-language) content here.
   */
  recipe: ExtractedRecipe;
  /** Optional trailing content inside the scroll (rarely needed). */
  footer?: ReactNode;
  /**
   * Fired when canonical title/ingredients/instructions/servings/calories change.
   * Never includes an active translation overlay (ADR 012).
   */
  onContentChange?: (content: RecipeContentSnapshot) => void;
  /** Saved recipes only — shows a heart toggle in the header. */
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** When set, ingredients added to the shopping list keep this recipe as provenance. */
  recipeId?: string;
  /** Preferred-language overlay from cache / auto-translate. */
  localizedContent?: RecipeTranslationContent | null;
  localizedLanguage?: RecipeLanguageCode | null;
  /** True while auto-translate is in flight. */
  translating?: boolean;
  /** Persist a language overlay without mutating canonical recipe rows. */
  onTranslationPersist?: (
    language: RecipeLanguageCode,
    content: RecipeTranslationContent,
  ) => void | Promise<void>;
  /** Prefer cache before Gemini when picking a language in the modal. */
  getCachedTranslation?: (
    language: RecipeLanguageCode,
  ) => Promise<RecipeTranslationContent | null> | RecipeTranslationContent | null;
  /** Persist a successful partial-recipe repair, including extraction_status. */
  onRepairApplied?: (recipe: RepairedRecipePayload) => void;
  /** Saved recipes only — persist cooked date and optional note. */
  onCookedChange?: (cooked: { last_cooked_at: string; cook_note: string }) => void;
}

/** Stack header on web — used so the side cook-along can fill the remaining viewport. */
const WEB_RECIPE_HEADER = 64;

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
  localizedContent,
  localizedLanguage = null,
  translating = false,
  onTranslationPersist,
  getCachedTranslation,
  onRepairApplied,
  onCookedChange,
}: RecipeViewProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors } = useThemePreference();
  const { isWide, isMediumUp, height: viewportHeight } = useBreakpoint();
  const { language: appLanguage } = useLanguagePreference();
  const { system: measurementSystem } = useMeasurementPreference();
  const { addFromRecipe } = useShoppingList();
  const {
    collections,
    createCollection,
    setMembershipsForRecipe,
    collectionsForRecipe,
  } = useCollections();
  const originalRef = useRef<RecipeContentSnapshot>(
    recipe.kitchen_original ?? {
      title: recipe.title,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      calories: recipe.calories,
    },
  );
  /** Untranslated content used as the source for every language switch. */
  const translationSourceRef = useRef<RecipeContentSnapshot | null>({
    title: recipe.title,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    calories: recipe.calories,
  });

  const [title, setTitle] = useState(localizedContent?.title ?? recipe.title);
  const [baseServings, setBaseServings] = useState(recipe.servings);
  const [baseIngredients, setBaseIngredients] = useState<Ingredient[]>(
    localizedContent?.ingredients ?? recipe.ingredients,
  );
  const [baseInstructions, setBaseInstructions] = useState<Instruction[]>(
    localizedContent?.instructions ?? recipe.instructions,
  );
  const [calories, setCalories] = useState(recipe.calories);
  const [servings, setServings] = useState(recipe.servings);
  const [tags, setTags] = useState<string[]>(recipe.tags ?? []);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [shoppingListModalOpen, setShoppingListModalOpen] = useState(false);
  const [editTagsOpen, setEditTagsOpen] = useState(false);
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [translateModalOpen, setTranslateModalOpen] = useState(false);
  const [cookAlongOpen, setCookAlongOpen] = useState(false);
  const [cookAlongStartSeconds, setCookAlongStartSeconds] = useState(0);
  const [cookAlongSheetHeight, setCookAlongSheetHeight] = useState(0);
  const [activeVariant, setActiveVariant] = useState<RecipeVariantKey | null>(
    recipe.kitchen_adapted_summary ? 'custom' : null,
  );
  const [variantSummary, setVariantSummary] = useState<string | null>(
    recipe.kitchen_adapted_summary ?? null,
  );
  const [extractionStatus, setExtractionStatus] = useState(recipe.extraction_status);
  const [repairing, setRepairing] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [kitchenAdapted, setKitchenAdapted] = useState(Boolean(recipe.kitchen_adapted_summary));
  const [cookModeOpen, setCookModeOpen] = useState(false);
  const [cookedNoteOpen, setCookedNoteOpen] = useState(false);
  const [lastCookedAt, setLastCookedAt] = useState(recipe.last_cooked_at);
  const [cookNote, setCookNote] = useState(recipe.cook_note ?? '');
  const [activeLanguage, setActiveLanguage] = useState<RecipeLanguageCode | null>(
    localizedLanguage,
  );
  const videoPanelRef = useRef<RecipeVideoPanelHandle>(null);

  function openCookAlong(startSeconds = 0) {
    setCookAlongStartSeconds(Math.max(0, Math.round(startSeconds)));
    setCookAlongOpen(true);
  }

  const recipeCollections = recipeId ? collectionsForRecipe(recipeId) : [];

  const scaledIngredients = scaleIngredients(baseIngredients, baseServings, servings);
  const swapTarget = swapIndex != null ? scaledIngredients[swapIndex] : null;
  const calorieDisplay = getCalorieDisplay(calories, baseServings, servings);
  const sourceLanguage = resolveRecipeSourceLanguage(recipe);
  const contentLanguage =
    activeLanguage ?? (isRecipeLanguageCode(sourceLanguage) ? sourceLanguage : null);
  const unitLanguage = resolveCulinaryLanguage(activeLanguage, appLanguage);
  const textDirection = isRtlRecipeLanguage(contentLanguage) ? 'rtl' : 'ltr';
  const appRtl = isRtlAppLanguage(appLanguage);
  const contentRtl = textDirection === 'rtl';
  const recipeRowDirection = contentRtl === appRtl ? 'row' : 'row-reverse';
  const durationLabels = {
    minutes: t('recipe.durationMin'),
    hours: t('recipe.durationHr'),
  };
  const costLabels = {
    $: t(COST_I18N_KEYS.$),
    $$: t(COST_I18N_KEYS.$$),
    $$$: t(COST_I18N_KEYS.$$$),
  } as const;

  // Sync auto-localized overlay from parent without rewriting canonical refs.
  useEffect(() => {
    translationSourceRef.current = {
      title: recipe.title,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      calories: recipe.calories,
    };
    // Keep the pre-adaptation snapshot. Overwriting from live recipe fields
    // would make "Revert to original" restore the adapted (or remixed) content.
    if (recipe.kitchen_original) {
      originalRef.current = {
        title: recipe.kitchen_original.title,
        servings: recipe.kitchen_original.servings,
        ingredients: recipe.kitchen_original.ingredients,
        instructions: recipe.kitchen_original.instructions,
        calories: recipe.kitchen_original.calories,
      };
    }
    setBaseServings(recipe.servings);
    setCalories(recipe.calories);
    setServings(recipe.servings);
    setTags(recipe.tags ?? []);
    setLastCookedAt(recipe.last_cooked_at);
    setCookNote(recipe.cook_note ?? '');

    if (localizedContent && localizedLanguage) {
      setTitle(localizedContent.title);
      setBaseIngredients(localizedContent.ingredients);
      setBaseInstructions(localizedContent.instructions);
      setActiveLanguage(localizedLanguage);
    } else {
      setTitle(recipe.title);
      setBaseIngredients(recipe.ingredients);
      setBaseInstructions(recipe.instructions);
      setActiveLanguage(null);
    }
  }, [
    recipe.title,
    recipe.servings,
    recipe.calories,
    recipe.ingredients,
    recipe.instructions,
    recipe.tags,
    recipe.last_cooked_at,
    recipe.cook_note,
    recipe.kitchen_original,
    localizedContent,
    localizedLanguage,
  ]);

  // When remix/swap mutates display while not translated, keep canonical ref in sync.
  useEffect(() => {
    if (activeLanguage != null) return;
    translationSourceRef.current = {
      title,
      servings: baseServings,
      ingredients: baseIngredients,
      instructions: baseInstructions,
      calories,
    };
  }, [title, baseServings, baseIngredients, baseInstructions, calories, activeLanguage]);

  useEffect(() => {
    if (activeLanguage != null) {
      const canonical = translationSourceRef.current;
      onContentChange?.({
        title: canonical?.title ?? recipe.title,
        servings: baseServings,
        ingredients: canonical?.ingredients ?? recipe.ingredients,
        instructions: canonical?.instructions ?? recipe.instructions,
        calories,
      });
      return;
    }
    onContentChange?.({
      title,
      servings: baseServings,
      ingredients: baseIngredients,
      instructions: baseInstructions,
      calories,
    });
  }, [
    title,
    baseServings,
    baseIngredients,
    baseInstructions,
    calories,
    activeLanguage,
    onContentChange,
    recipe.title,
    recipe.ingredients,
    recipe.instructions,
  ]);

  function handleApplySubstitution(
    alternative: SubstitutionAlternative,
    nextInstructions: Instruction[],
  ) {
    if (swapIndex == null) return;
    const factor = baseServings / servings;
    setBaseIngredients((prev) =>
      prev.map((ing, i) =>
        i === swapIndex
          ? scaleIngredient(
              {
                name: alternative.name,
                unit: alternative.unit,
                quantity: alternative.quantity,
                metric: alternative.metric,
                spoons: alternative.spoons,
              },
              factor,
            )
          : ing,
      ),
    );
    setBaseInstructions(nextInstructions);
    // Promote display content to canonical (same as remix) so the swap persists
    // instead of echoing the pre-swap translation source.
    if (activeLanguage != null) {
      setActiveLanguage(null);
    }
    setSwapIndex(null);
  }

  function handleApplyVariant(result: TransformedRecipePayload, variant: RecipeVariantKey) {
    const canonicalTitle = translationSourceRef.current?.title ?? recipe.title;
    setTitle(canonicalTitle);
    setBaseServings(result.servings);
    setBaseIngredients(result.ingredients);
    setBaseInstructions(result.instructions);
    setCalories(result.calories);
    setServings(result.servings);
    setActiveVariant(variant);
    setVariantSummary(result.summary);
    setKitchenAdapted(false);
    setActiveLanguage(null);
    translationSourceRef.current = {
      title: canonicalTitle,
      servings: result.servings,
      ingredients: result.ingredients,
      instructions: result.instructions,
      calories: result.calories,
    };
    onContentChange?.({
      title: canonicalTitle,
      servings: result.servings,
      ingredients: result.ingredients,
      instructions: result.instructions,
      calories: result.calories,
      kitchen_adapted_summary: null,
      kitchen_original: null,
    });
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
    translationSourceRef.current = { ...original };
    setKitchenAdapted(false);
    onContentChange?.({
      ...original,
      kitchen_adapted_summary: null,
      kitchen_original: null,
    });
  }

  async function handleRepair() {
    if (repairing || extractionStatus !== 'partial' || recipeIsInvented(recipe)) return;

    if (!user) {
      const signUp = await confirmAction(
        t('recipe.repairSignInTitle'),
        t('recipe.repairSignInBody'),
        t('auth.signUp'),
        t('common.notNow'),
      );
      if (signUp) router.push('/auth?mode=signup&reason=extract');
      return;
    }

    setRepairing(true);
    const canonical = translationSourceRef.current ?? {
      title: recipe.title,
      servings: baseServings,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      calories,
    };
    const request = {
      title: canonical.title,
      servings: canonical.servings,
      ingredients: canonical.ingredients,
      instructions: canonical.instructions,
      calories: canonical.calories,
      estimated_time_minutes: recipe.estimated_time_minutes,
      cost_estimate: recipe.cost_estimate,
      effort_level: recipe.effort_level,
      tags: recipe.tags,
      source_language: recipe.source_language,
      original_url: recipe.original_url,
    };
    const requestKey = repairRequestKey(request);

    try {
      const result = await repairRecipe(request);

      if (result.code === 'insufficient_credits') {
        setCreditsOpen(true);
        return;
      }
      if (result.code === 'auth_required' || result.code === 'guest_limit' || result.code === 'guest_id_required') {
        const signUp = await confirmAction(
          t('recipe.repairSignInTitle'),
          t('recipe.repairSignInBody'),
          t('auth.signUp'),
          t('common.notNow'),
        );
        if (signUp) router.push('/auth?mode=signup&reason=extract');
        return;
      }
      if (result.status === 'failed' || !result.recipe) {
        Alert.alert(
          t('recipe.repairFailedTitle'),
          result.code === 'no_improvement'
            ? t('recipe.repairNoImprovement')
            : (result.message ?? t('recipe.repairFailed')),
        );
        return;
      }

      const summary = result.summary?.trim() || t('recipe.repairDefaultSummary');
      const apply = await confirmAction(
        t('recipe.repairApplyTitle'),
        t('recipe.repairApplyBody', { summary }),
        t('recipe.repairApply'),
        t('common.cancel'),
      );
      if (!apply) {
        if (result.reservation_id) {
          await settleRepairRecipe('abort', result.reservation_id, result.request_id);
        }
        if (result.request_id) await clearExtractionRequestId(requestKey, result.request_id);
        return;
      }

      if (result.reservation_id) {
        const settled = await settleRepairRecipe('commit', result.reservation_id, result.request_id);
        if (settled.status === 'failed') {
          await settleRepairRecipe('abort', result.reservation_id, result.request_id);
          Alert.alert(t('recipe.repairFailedTitle'), t('recipe.repairFailed'));
          return;
        }
      }
      if (result.request_id) await clearExtractionRequestId(requestKey, result.request_id);

      const next = result.recipe;
      setTitle(next.title);
      setBaseServings(next.servings);
      setBaseIngredients(next.ingredients);
      setBaseInstructions(next.instructions);
      setCalories(next.calories ?? undefined);
      setServings(next.servings);
      setExtractionStatus(next.extraction_status);
      setActiveLanguage(null);
      translationSourceRef.current = {
        title: next.title,
        servings: next.servings,
        ingredients: next.ingredients,
        instructions: next.instructions,
        calories: next.calories ?? undefined,
      };
      originalRef.current = translationSourceRef.current;
      onRepairApplied?.(next);
    } catch {
      Alert.alert(t('recipe.repairFailedTitle'), t('recipe.repairFailed'));
    } finally {
      setRepairing(false);
    }
  }

  async function handleApplyTranslation(
    result: TranslatedRecipePayload,
    language: RecipeLanguageCode,
  ) {
    if (!translationSourceRef.current) {
      translationSourceRef.current = {
        title: recipe.title,
        servings: baseServings,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        calories,
      };
    }
    await onTranslationPersist?.(language, {
      title: result.title,
      ingredients: result.ingredients,
      instructions: result.instructions,
    });
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
  }

  const sourceShareUrl = recipeSourceShareUrl(recipe.original_url);

  function stampCooked(openNote: boolean) {
    if (!onCookedChange) return;
    const at = new Date().toISOString();
    setLastCookedAt(at);
    onCookedChange({ last_cooked_at: at, cook_note: cookNote });
    if (openNote) setCookedNoteOpen(true);
  }

  async function handleShare() {
    if (!sourceShareUrl) return;

    try {
      const result = await shareRecipe({
        title,
        url: sourceShareUrl,
      });
      if (result === 'copied') {
        Alert.alert(t('recipe.linkCopied'));
      }
    } catch {
      Alert.alert(t('recipe.shareFailedTitle'), t('common.tryAgain'));
    }
  }

  const translationSource = translationSourceRef.current ?? {
    title: recipe.title,
    servings: baseServings,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    calories,
  };

  const sourceVideo = getRecipeVideoInfo(
    recipe.original_url,
    recipe.platform,
    recipe.source_video_url,
  );
  const showSideThumbnail = Boolean(recipe.image_url) && sourceVideo.mode === 'none';
  const hasStepTimestamps = useMemo(
    () => baseInstructions.some((step) => step.timestamp_seconds != null),
    [baseInstructions],
  );
  const hasUnknownAmounts = recipeHasUnknownAmounts(scaledIngredients, measurementSystem);
  const cookedDateLabel = lastCookedAt
    ? formatCookedDate(lastCookedAt, appLanguage)
    : '';

  async function handleStepTimestamp(seconds: number) {
    if (sourceVideo.mode === 'none' || !recipe.original_url) return;
    if (videoPanelRef.current) {
      videoPanelRef.current.seekTo(seconds);
      return;
    }
    openCookAlong(seconds);
  }

  const sideCookAlong = isWide && sourceVideo.mode !== 'none';
  const splitRecipeBody = isWide && !sideCookAlong;

  return (
    <View className="flex-1">
    <View
      style={
        sideCookAlong
          ? { flex: 1, flexDirection: 'row', width: '100%', maxWidth: 1200, alignSelf: 'center' }
          : { flex: 1 }
      }
    >
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingBottom: 24 + (sideCookAlong ? 0 : cookAlongSheetHeight),
      }}
    >
      <View
        className={isMediumUp ? 'px-5 pt-3 pb-2' : 'px-5 pt-4'}
        style={
          isMediumUp && !sideCookAlong
            ? {
                width: '100%',
                maxWidth: splitRecipeBody ? 1040 : RecipeReadingWidth,
                alignSelf: 'center',
              }
            : undefined
        }
      >
        {!sideCookAlong && sourceVideo.mode !== 'none' ? (
          <RecipeVideoPanel
            ref={videoPanelRef}
            originalUrl={recipe.original_url}
            platform={recipe.platform}
            sourceVideoUrl={recipe.source_video_url}
            posterUri={recipe.image_url}
            onRequestPlay={openCookAlong}
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
                  className={`flex-1 font-bold ${isMediumUp ? 'text-xl leading-7' : 'text-2xl leading-8'}`}
                  style={{ color: colors.text, writingDirection: textDirection }}
                >
                  {title}
                </Text>
                {sourceShareUrl ? (
                  <TouchableOpacity
                    onPress={() => {
                      void handleShare();
                    }}
                    hitSlop={12}
                    activeOpacity={0.6}
                    className="mt-0.5 px-1"
                    accessibilityLabel={t('recipe.share')}
                  >
                    <Ionicons
                      name="share-outline"
                      size={24}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                ) : null}
                {onToggleFavorite != null && (
                  <TouchableOpacity
                    onPress={onToggleFavorite}
                    hitSlop={12}
                    activeOpacity={0.6}
                    className="mt-0.5 px-1"
                    accessibilityLabel={
                      isFavorite ? t('library.removeFavorite') : t('library.addFavorite')
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
                  <Badge
                    label={t('recipe.calPerServing', { count: calorieDisplay.perServing })}
                    icon="flame-outline"
                  />
                )}
                {recipe.estimated_time_minutes != null && (
                  <Badge
                    label={formatRecipeDuration(recipe.estimated_time_minutes, durationLabels)}
                    icon="time-outline"
                  />
                )}
                {recipe.cost_estimate && (
                  <Badge
                    label={costLabels[recipe.cost_estimate]}
                    leading={
                      <CostMeter
                        tier={recipe.cost_estimate}
                        color={colors.primary}
                        size={7}
                      />
                    }
                    accessibilityLabel={t('recipe.cost.a11y', {
                      label: costLabels[recipe.cost_estimate],
                      count: costFilledCount(recipe.cost_estimate),
                    })}
                  />
                )}
                {recipe.effort_level && (
                  <Badge
                    label={t(`recipe.effort.${recipe.effort_level.toLowerCase()}`)}
                    icon="fitness-outline"
                  />
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
                        router.dismissTo({ pathname: '/', params: { tag } })
                      }
                    >
                      <Text
                        className="text-[11px] font-medium"
                        style={{ color: colors.textSecondary }}
                      >
                        {translateRecipeTag(tag, t)}
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
                        {tags.length > 0 ? t('tags.editTitle') : t('tags.addTags')}
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
                        router.dismissTo({
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
              {onCookedChange ? (
                <View className="mt-3">
                  {lastCookedAt && cookedDateLabel ? (
                    <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
                      {cookNote.trim()
                        ? t('recipe.cookedOnWithNote', { date: cookedDateLabel, note: cookNote.trim() })
                        : t('recipe.cookedOn', { date: cookedDateLabel })}
                    </Text>
                  ) : null}
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    <Pressable
                      onPress={() => stampCooked(!lastCookedAt)}
                      className="min-h-[40px] items-center justify-center rounded-full px-3.5 active:opacity-80"
                      style={{ backgroundColor: colors.primarySoft }}
                      accessibilityRole="button"
                      accessibilityLabel={
                        lastCookedAt ? t('recipe.cookedAgain') : t('recipe.cookedAction')
                      }
                    >
                      <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                        {lastCookedAt ? t('recipe.cookedAgain') : t('recipe.cookedAction')}
                      </Text>
                    </Pressable>
                    {lastCookedAt ? (
                      <Pressable
                        onPress={() => setCookedNoteOpen(true)}
                        className="min-h-[40px] items-center justify-center rounded-full px-3.5 active:opacity-80"
                        style={{ backgroundColor: colors.frosted }}
                        accessibilityRole="button"
                        accessibilityLabel={t('recipe.cookedNoteTitle')}
                      >
                        <Text className="text-xs font-semibold" style={{ color: colors.text }}>
                          {t('recipe.cookedNoteTitle')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
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

        {translating ? (
          <View
            className="mb-4 rounded-2xl border px-4 py-3"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <Text className="text-sm" style={{ color: colors.textSecondary }}>
              {t('recipe.translating')}
            </Text>
          </View>
        ) : null}

        {activeLanguage != null && (
          <View
            className="mb-4 rounded-2xl border px-4 py-3"
            style={{ borderColor: colors.primarySoft, backgroundColor: colors.primarySoft }}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
              {t('recipe.showingLanguage', {
                language: t(`languages.${activeLanguage}`),
              })}
            </Text>
            <Pressable onPress={handleShowOriginalLanguage} className="mt-2 active:opacity-70">
              <Text className="text-sm font-semibold" style={{ color: colors.accent }}>
                {t('recipe.showOriginal')}
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
              {kitchenAdapted
                ? t('recipe.kitchenAdapted')
                : t('recipe.variantVersion', {
                    variant: t(`recipe.variants.${activeVariant}.label`),
                  })}
            </Text>
            {variantSummary != null && (
              <Text className="mt-1 text-sm leading-5" style={{ color: colors.text }}>
                {variantSummary}
              </Text>
            )}
            <Pressable onPress={handleRevertVariant} className="mt-2 active:opacity-70">
              <Text className="text-sm font-semibold" style={{ color: colors.accent }}>
                {t('recipe.revertOriginal')}
              </Text>
            </Pressable>
          </View>
        )}

        {recipeIsInvented(recipe) ? (
          <View
            className="mb-4 rounded-3xl border p-4"
            style={{ borderColor: colors.accentSoft, backgroundColor: colors.accentSoft }}
            accessibilityLabel={t('recipe.inventedBanner')}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.accent }}>
              {t('recipe.inventedChip')}
            </Text>
            <Text className="mt-1 text-xs leading-4" style={{ color: colors.textSecondary }}>
              {t('recipe.inventedBanner')}
            </Text>
          </View>
        ) : null}

        {extractionStatus === 'partial' && recipeIsInvented(recipe) ? (
          <View
            className="mb-4 rounded-3xl border p-4"
            style={{ borderColor: colors.warningSoft, backgroundColor: colors.warningSoft }}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.warning }}>
              {t('recipe.inventedPartial')}
            </Text>
          </View>
        ) : null}

        {extractionStatus === 'partial' && !recipeIsInvented(recipe) && (
          <View
            className="mb-4 rounded-3xl border p-4"
            style={{ borderColor: colors.warningSoft, backgroundColor: colors.warningSoft }}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.warning }}>
              {t('recipe.partialExtraction')}
            </Text>
            <Text className="mt-1 text-xs leading-4" style={{ color: colors.textSecondary }}>
              {t('recipe.repairHint')}
            </Text>
            <Pressable
              onPress={() => void handleRepair()}
              disabled={repairing}
              className="mt-3 min-h-[44px] items-center justify-center rounded-3xl px-4 active:opacity-80"
              style={{ backgroundColor: colors.warning }}
              accessibilityRole="button"
              accessibilityLabel={t('recipe.repairAction')}
            >
              {repairing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-sm font-semibold text-white">{t('recipe.repairAction')}</Text>
              )}
            </Pressable>
          </View>
        )}

        <View className={splitRecipeBody ? 'flex-row items-start gap-6' : undefined}>
          <View className={splitRecipeBody ? 'min-w-0 flex-1' : undefined}>
        <View
          className="mb-5 flex-row items-center justify-between rounded-3xl border px-4 py-3.5"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <View>
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>
              {t('recipe.servings')}
            </Text>
            {calorieDisplay != null && (
              <Text className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                {t('recipe.calTotal', { count: calorieDisplay.total.toLocaleString() })}
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
              title={t('recipe.ingredients')}
              count={scaledIngredients.length}
              headerRight={
                <Pressable
                  className="flex-row items-center gap-1 rounded-full px-3 py-1.5 active:opacity-80"
                  style={{ backgroundColor: colors.primarySoft }}
                  onPress={() => setShoppingListModalOpen(true)}
                >
                  <Ionicons name="cart-outline" size={14} color={colors.primary} />
                  <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                    {t('addToList.title')}
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
                    className="min-w-0 flex-1 text-base font-medium"
                    style={{
                      color: colors.text,
                      writingDirection: textDirection,
                      textAlign: textDirection === 'rtl' ? 'right' : 'left',
                      paddingEnd: 8,
                    }}
                  >
                    {ing.name}
                  </Text>
                  <View className="flex-row items-center gap-3">
                    <IngredientAmountText
                      amount={
                        displayIngredientAmount(ing, {
                          system: measurementSystem,
                          language: unitLanguage,
                        }) || t('recipe.amountUnknown')
                      }
                      isPinch={displayedAmountIsPinch(ing, {
                        system: measurementSystem,
                      })}
                      color={colors.textSecondary}
                      pinchColor={colors.primary}
                      writingDirection={textDirection}
                    />
                    <Pressable
                      className="rounded-full px-3 py-1.5"
                      style={{ backgroundColor: colors.accentSoft }}
                      onPress={() => setSwapIndex(index)}
                    >
                      <Text className="text-xs font-semibold" style={{ color: colors.accent }}>
                        {t('recipe.swapAction')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </Section>
            {hasUnknownAmounts && !recipeIsInvented(recipe) ? (
              <Text className="-mt-2 mb-4 px-1 text-xs leading-5" style={{ color: colors.textSecondary }}>
                {t('recipe.amountsUnknownHint')}
              </Text>
            ) : null}
          </>
        )}

        <View className="mb-5 mt-1 flex-row gap-2">
          <Pressable
            onPress={() => setTranslateModalOpen(true)}
            className="min-h-[44px] min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border px-2 active:opacity-90"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            accessibilityRole="button"
            accessibilityLabel={t('recipe.translate')}
          >
            <Ionicons name="language-outline" size={18} color={colors.primary} />
            <Text className="text-xs font-bold" style={{ color: colors.text }} numberOfLines={1}>
              {t('recipe.translate')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setVariantModalOpen(true)}
            className="min-h-[44px] min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl px-2 active:opacity-90"
            style={{ backgroundColor: colors.accentSoft }}
            accessibilityRole="button"
            accessibilityLabel={t('recipe.remix')}
          >
            <Ionicons name="color-wand-outline" size={18} color={colors.accent} />
            <Text className="text-xs font-bold" style={{ color: colors.text }} numberOfLines={1}>
              {t('recipe.remix')}
            </Text>
          </Pressable>
          {recipeId ? (
            <Pressable
              onPress={() => setCollectionModalOpen(true)}
              className="min-h-[44px] w-11 items-center justify-center rounded-2xl border active:opacity-90"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
              accessibilityRole="button"
              accessibilityLabel={t('library.addToCollection')}
            >
              <Ionicons name="folder-outline" size={18} color={colors.accent} />
            </Pressable>
          ) : null}
        </View>
          </View>

          <View className={splitRecipeBody ? 'min-w-0 flex-[1.2]' : undefined}>
        {baseInstructions.length > 0 && (
          <Section
            title={t('recipe.instructions')}
            count={baseInstructions.length}
            headerRight={
              <View className="flex-row items-center gap-2">
                {baseInstructions.length > 0 ? (
                  <Pressable
                    className="flex-row items-center gap-1 rounded-full px-3 py-1.5 active:opacity-80"
                    style={{ backgroundColor: colors.primarySoft }}
                    onPress={() => setCookModeOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('recipe.cookMode')}
                  >
                    <Ionicons name="restaurant-outline" size={14} color={colors.primary} />
                    <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                      {t('recipe.cookMode')}
                    </Text>
                  </Pressable>
                ) : null}
                {hasStepTimestamps ? (
                  <Text className="text-[11px] font-medium" style={{ color: colors.textSecondary }}>
                    {t('recipe.tapTimeToJump')}
                  </Text>
                ) : null}
              </View>
            }
          >
            {baseInstructions.map((step, index) => (
              <View
                key={`${step.step}-${index}`}
                className={`flex-row gap-3 py-3.5 ${
                  index < baseInstructions.length - 1 ? 'border-b' : ''
                }`}
                style={{
                  flexDirection: recipeRowDirection,
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
                      accessibilityLabel={t('recipe.jumpToStep', {
                        step: step.step,
                        time: formatVideoTimestamp(step.timestamp_seconds),
                      })}
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
          </View>
        </View>

        {footer}
      </View>
    </ScrollView>

      {sideCookAlong ? (
        <View
          style={{
            width: cookAlongOpen ? 440 : 360,
            paddingTop: 16,
            paddingRight: 20,
            paddingBottom: 16,
            paddingLeft: 8,
            alignSelf: cookAlongOpen ? 'stretch' : 'flex-start',
            // Keep cook-along visible while the recipe scrolls (web).
            position: 'sticky' as 'relative',
            top: cookAlongOpen ? 0 : 16,
            // Full remaining viewport so Reels / TikTok can play portrait-tall.
            ...(cookAlongOpen
              ? {
                  height: viewportHeight - WEB_RECIPE_HEADER,
                  maxHeight: viewportHeight - WEB_RECIPE_HEADER,
                  minHeight: 0,
                }
              : null),
          }}
        >
          {cookAlongOpen && recipe.original_url ? (
            <CookAlongVideoModal
              visible
              placement="sidebar"
              onClose={() => {
                setCookAlongOpen(false);
                setCookAlongSheetHeight(0);
              }}
              originalUrl={recipe.original_url}
              platform={recipe.platform}
              sourceVideoUrl={recipe.source_video_url}
              startSeconds={cookAlongStartSeconds}
            />
          ) : (
            <RecipeVideoPanel
              ref={videoPanelRef}
              originalUrl={recipe.original_url}
              platform={recipe.platform}
              sourceVideoUrl={recipe.source_video_url}
              posterUri={recipe.image_url}
              onRequestPlay={openCookAlong}
            />
          )}
        </View>
      ) : null}
    </View>

      {!sideCookAlong && cookAlongOpen && recipe.original_url ? (
        <CookAlongVideoModal
          visible={cookAlongOpen}
          onClose={() => {
            setCookAlongOpen(false);
            setCookAlongSheetHeight(0);
          }}
          originalUrl={recipe.original_url}
          platform={recipe.platform}
          sourceVideoUrl={recipe.source_video_url}
          startSeconds={cookAlongStartSeconds}
          onSheetHeightChange={setCookAlongSheetHeight}
        />
      ) : null}

      {/* Modals must sit outside ScrollView — nested Modals often fail to present on iOS. */}
      <AddToShoppingListModal
        visible={shoppingListModalOpen}
        ingredients={scaledIngredients}
        language={activeLanguage}
        onClose={() => setShoppingListModalOpen(false)}
        onConfirm={async (selected) => {
          const normalized = selected.map((ing) => {
            const converted = pickIngredientAmount(ing, measurementSystem);
            const unknown = ingredientAmountIsUnknown(ing, measurementSystem);
            return {
              ...ing,
              quantity: unknown ? 0 : converted.quantity,
              unit: converted.unit,
            };
          });
          const result = await addFromRecipe(normalized, recipeId);
          const dupNote =
            result.alreadyOnList.length === 0
              ? ''
              : result.alreadyOnList.length === 1
                ? `\n\n${t('recipe.alreadyOnListOne', { name: result.alreadyOnList[0] })}`
                : `\n\n${t('recipe.alreadyOnListOther', { count: result.alreadyOnList.length })}`;
          Alert.alert(
            t('recipe.addedToList'),
            `${t(
              selected.length === 1 ? 'recipe.addedToListBodyOne' : 'recipe.addedToListBodyOther',
              { count: selected.length },
            )}${dupNote}`,
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
        instructions={baseInstructions}
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
        recipeId={recipeId && !recipeId.startsWith('guest-') ? recipeId : undefined}
        originalUrl={recipe.original_url}
        onClose={() => setVariantModalOpen(false)}
        onApply={handleApplyVariant}
      />

      <RecipeTranslateModal
        visible={translateModalOpen}
        title={translationSource.title}
        ingredients={translationSource.ingredients}
        instructions={translationSource.instructions}
        activeLanguage={activeLanguage}
        getCachedTranslation={
          getCachedTranslation ??
          ((language) => recipe.translations?.[language] ?? null)
        }
        onClose={() => setTranslateModalOpen(false)}
        onApply={handleApplyTranslation}
        onShowOriginal={handleShowOriginalLanguage}
      />

      <TokenPurchaseSheet visible={creditsOpen} onClose={() => setCreditsOpen(false)} />

      {cookModeOpen ? (
        <CookMode
          visible={cookModeOpen}
          title={title}
          instructions={baseInstructions}
          textDirection={textDirection}
          onClose={() => setCookModeOpen(false)}
          onCooked={
            onCookedChange
              ? () => {
                  setCookModeOpen(false);
                  stampCooked(!lastCookedAt);
                }
              : undefined
          }
        />
      ) : null}

      {onCookedChange ? (
        <CookedNoteModal
          visible={cookedNoteOpen}
          initialValue={cookNote}
          onClose={() => setCookedNoteOpen(false)}
          onSave={(note) => {
            const at = lastCookedAt ?? new Date().toISOString();
            setLastCookedAt(at);
            setCookNote(note);
            onCookedChange({ last_cooked_at: at, cook_note: note });
          }}
        />
      ) : null}
    </View>
  );
}

function Badge({
  label,
  icon,
  leading,
  accessibilityLabel,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  leading?: ReactNode;
  accessibilityLabel?: string;
}) {
  const { colors } = useThemePreference();
  return (
    <View
      accessible={accessibilityLabel != null}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'text' : undefined}
      className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
      style={{ backgroundColor: colors.primarySoft }}
    >
      {leading ??
        (icon ? <Ionicons name={icon} size={12} color={colors.primary} /> : null)}
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
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        icon === 'add' ? t('recipe.increaseServings') : t('recipe.decreaseServings')
      }
      className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
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
  const { t } = useTranslation();
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
              {t(count === 1 ? 'recipe.itemCountOne' : 'recipe.itemCountOther', { count })}
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
