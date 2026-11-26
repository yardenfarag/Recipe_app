import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, View, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MeasurementToggle } from '@/components/MeasurementToggle';
import { AddToCollectionModal } from '@/components/AddToCollectionModal';
import { AddToShoppingListModal } from '@/components/AddToShoppingListModal';
import { CookAlongVideoModal } from '@/components/CookAlongVideoModal';
import { CookMode } from '@/components/CookMode';
import { CookedNoteModal } from '@/components/CookedNoteModal';
import { PantryUsedUpOffer } from '@/components/pantry/PantryUsedUpSheet';
import { RecipeAppliances } from '@/components/RecipeAppliances';
import { EditTagsModal } from '@/components/EditTagsModal';
import { RecipeVideoPanel, type RecipeVideoPanelHandle } from '@/components/RecipeVideoPanel';
import { RecipeTranslateModal } from '@/components/RecipeTranslateModal';
import { RecipeVariantModal } from '@/components/RecipeVariantModal';
import { SubstitutionModal } from '@/components/SubstitutionModal';
import { TokenPurchaseSheet } from '@/components/TokenPurchaseSheet';
import { RecipeCookBar } from '@/components/recipe/RecipeCookBar';
import { CostDots, RecipeFact, RecipeUpdatingFact } from '@/components/recipe/RecipeFact';
import { RecipeNutritionPanel } from '@/components/recipe/RecipeNutritionPanel';
import { HERO_OVERLAP, RecipeHero, type HeroCookAlong } from '@/components/recipe/RecipeHero';
import { RecipeIngredientList } from '@/components/recipe/RecipeIngredientList';
import { RecipeMoreMenu, type RecipeMenuItem } from '@/components/recipe/RecipeMoreMenu';
import { RecipeNotice } from '@/components/recipe/RecipeNotice';
import { RecipeStepList } from '@/components/recipe/RecipeStepList';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { Tile, TileBadge } from '@/components/ui/Tile';
import { KitIcon, Radii, usePhotoColors } from '@/components/ui/tokens';
import { RecipeReadingWidth } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useCollections } from '@/hooks/useCollections';
import { useKitchenProfile } from '@/hooks/useKitchenProfile';
import { useOwnedAppliances } from '@/hooks/useOwnedAppliances';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useMeasurementPreference } from '@/hooks/useMeasurementPreference';
import { useUnitSystemPreference } from '@/hooks/useUnitSystemPreference';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { useAuth } from '@/hooks/useAuth';
import { announce } from '@/lib/a11y';
import { goBackOrHome } from '@/lib/goBackOrHome';
import { captureRecipeCooked, type RecipeCookedFrom } from '@/lib/analytics';
import { allergyInstruction, findAvoidMatches, hasAllergies, makeWithoutInstruction } from '@shared/lib/avoidList';
import { setGuestRecipeTags } from '@/lib/guestRecipes';
import { displayStepText } from '@shared/lib/displayStepText';
import { pickIngredientAmount, scaleIngredient, scaleIngredients } from '@shared/lib/ingredientAmounts';
import { isRtlAppLanguage } from '@shared/lib/appLanguages';
import { askConfirm, showNotice } from '@/lib/dialog';
import { clearExtractionRequestId } from '@/lib/extractionRequestId';
import { resolveCulinaryLanguage } from '@shared/lib/culinaryUnits';
import { displayIngredientAmount, displayedAmountIsPinch, ingredientAmountIsUnknown, recipeHasUnknownAmounts } from '@shared/lib/displayIngredientAmount';
import { formatCookedDate } from '@shared/lib/formatCookedDate';
import { COST_I18N_KEYS, costFilledCount } from '@shared/lib/formatCostEstimate';
import { formatRecipeDuration } from '@shared/lib/formatRecipeDuration';
import { getRecipePlatformLabel, getRecipeVideoInfo } from '@/lib/recipeVideo';
import { recordCookForReviewPrompt } from '@/lib/reviewPrompt';
import { getCalorieDisplay } from '@shared/lib/recipeCalories';
import { getNutritionDisplay } from '@shared/lib/recipeNutrition';
import { recipeHasSource, recipeIsInvented, recipeOriginChip } from '@shared/lib/recipeOrigin';
import { recipeSource } from '@shared/lib/recipeSource';
import {
  isRecipeLanguageCode,
  isRtlRecipeLanguage,
  RecipeLanguageCode,
} from '@shared/lib/recipeLanguages';
import { resolveRecipeSourceLanguage } from '@shared/lib/recipeSourceLanguage';
import { normalizeRecipeTags, translateRecipeTag } from '@shared/lib/recipeTags';
import { RecipeVariantKey } from '@shared/lib/recipeVariants';
import { recipeSourceShareUrl, shareRecipe } from '@/lib/shareRecipe';
import { isApplianceKey, recipeAppliancesOf } from '@shared/lib/appliances';
import { applianceNameKey } from '@shared/lib/applianceDisplay';
import {
  applianceWorkaroundInstruction,
  checkKitchen,
  worthAskingAboutAppliances,
} from '@shared/lib/ownedAppliances';
import { ExtractedRecipe } from '@/lib/supabase/extractRecipe';
import { createRecipeShare } from '@shared/lib/supabase/recipeShare';
import { REPAIR_ERROR_KEYS, serverErrorText, SHARE_ERROR_KEYS } from '@shared/lib/serverErrors';
import { showToast } from '@shared/lib/toast';
import { setRecipeTags } from '@shared/lib/supabase/recipes';
import { repairRecipe, repairRequestKey, settleRepairRecipe } from '@/lib/supabase/repairRecipe';
import type { RepairedRecipePayload } from '@/lib/supabase/repairRecipe';
import { SubstitutionAlternative } from '@shared/lib/supabase/suggestSubstitution';
import { TranslatedRecipePayload } from '@shared/lib/supabase/translateRecipe';
import { TransformedRecipePayload } from '@shared/lib/supabase/transformRecipe';
import {
  Ingredient,
  Instruction,
  type RecalcField,
  Recipe,
  type RecipeNutrition,
  RecipeTranslationContent,
} from '@shared/types/recipe';

interface RecipeContentSnapshot {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  calories?: number;
  /** PIN-80. Travels with calories: null = none. */
  nutrition?: RecipeNutrition | null;
  kitchen_adapted_summary?: string | null;
  kitchen_original?: Recipe['kitchen_original'] | null;
  /** ADR 017. Only set when a remix or revert changes them; absent = leave as stored. */
  appliances?: Recipe['appliances'];
  /**
   * The language this text is in, when it may not be the recipe's so far (PIN-187): a swap or remix made a
   * translation the recipe's text, or a revert goes back to text from before that. Absent = the language stays.
   */
  source_language?: string;
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
   * Showing a translation never fires it (ADR 012). A swap or remix made on a translation does: that translation
   * becomes the recipe's text, and `source_language` says which language it is in (PIN-187).
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
  /**
   * Remix, translate, swap, and repair only stick on a library recipe. Repair spends a credit;
   * remix (TOKEN_COST_REMIX = 0), translate and swap are free, within daily caps.
   * Hub previews leave this off so those actions cannot discard work.
   */
  allowAdaptations?: boolean;
  /** Saved recipes only: opens Edit recipe (ADR 018). Shows a pencil next to the title. */
  onEdit?: () => void;
  /** Fields a hand edit is recalculating in the background: shown as "Updating…" (ADR 018). */
  updatingFields?: readonly RecalcField[];
  /**
   * The recipe's own page (PIN-177): the photo runs to the top of the screen under the back, heart, share and more
   * buttons, the details slide up over it, and "Start cooking" stays fixed at the bottom. The screen hides its
   * header for it. Off (Hub and shared recipes, under their own header): the photo is a tile and "Start cooking"
   * sits in the details.
   */
  immersive?: boolean;
  /** Back, at the start of the top row (immersive). Defaults to going back, or to the Library. */
  onBack?: () => void;
  /** A note at the top of the details, such as "Saved to your Library · Remove". */
  topNotice?: ReactNode;
  /**
   * The screen's main action in the bottom bar (a preview's Save). "Start cooking" then becomes an icon beside it.
   */
  primaryAction?: { label: string; onPress: () => void; busy?: boolean; trackId: string };
  /** "Discard" in the more menu (a preview that isn't saved). */
  onDiscard?: () => void;
  /**
   * Open cook mode ('cook', if the recipe has steps) or the cook-along video ('video', if it has one) as soon as it
   * shows, once: the Library's "Tonight's pick" links here with ?cook=1 or ?video=1.
   */
  autoStart?: 'cook' | 'video' | null;
  /** Called once the auto start has been handled, so the screen can forget it. */
  onAutoStarted?: () => void;
}

/** Stack header on web — used so the side cook-along can fill the remaining viewport. */
const WEB_RECIPE_HEADER = 64;
const NO_FIELDS: readonly RecalcField[] = [];

/**
 * Full recipe display in the Night Market look (PIN-177): the photo with the page's buttons on it, a details tile
 * (where it was saved from, the title, four facts, tags, when it was last cooked), notes, the tools that change it
 * (remix, translate, collections), what you'll need, then Ingredients | Steps as tabs on a phone with the servings
 * stepper and spoons/grams, and "Start cooking" fixed at the bottom. Shared by the recipe page, the Snap preview,
 * and Hub and shared recipes. Rendering only: the logic (scaling, swaps, remix, translation, repair) lives here
 * unchanged; presentational pieces are in src/components/recipe/.
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
  allowAdaptations = true,
  onEdit,
  updatingFields = NO_FIELDS,
  immersive = false,
  onBack,
  topNotice,
  primaryAction,
  onDiscard,
  autoStart = null,
  onAutoStarted,
}: RecipeViewProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors, scheme } = useThemePreference();
  const photo = usePhotoColors();
  const type = useTypography();
  const insets = useSafeAreaInsets();
  const [photoFailed, setPhotoFailed] = useState(false);
  const [pastPhoto, setPastPhoto] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [tab, setTab] = useState<RecipeTab>('ingredients');
  const [barHeight, setBarHeight] = useState(0);
  useEffect(() => {
    setPhotoFailed(false);
  }, [recipe.image_url]);
  const { isWide, isMediumUp, height: viewportHeight } = useBreakpoint();
  const { language: appLanguage } = useLanguagePreference();
  const { system: measurementSystem } = useMeasurementPreference();
  const { units } = useUnitSystemPreference();
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
      nutrition: recipe.nutrition ?? null,
      appliances: recipe.appliances,
    },
  );
  /** ADR 017: cleaned against the canonical steps; null = not analysed (section hidden). */
  const appliances = useMemo(
    () => recipeAppliancesOf({ appliances: recipe.appliances, instructions: recipe.instructions }),
    [recipe.appliances, recipe.instructions],
  );
  /** Untranslated content used as the source for every language switch. */
  const translationSourceRef = useRef<RecipeContentSnapshot | null>({
    title: recipe.title,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    calories: recipe.calories,
    nutrition: recipe.nutrition ?? null,
  });

  const [title, setTitle] = useState(localizedContent?.title ?? recipe.title);
  const [shareBusy, setShareBusy] = useState(false);
  const [baseServings, setBaseServings] = useState(recipe.servings);
  const [baseIngredients, setBaseIngredients] = useState<Ingredient[]>(
    localizedContent?.ingredients ?? recipe.ingredients,
  );
  const [baseInstructions, setBaseInstructions] = useState<Instruction[]>(
    localizedContent?.instructions ?? recipe.instructions,
  );
  const [calories, setCalories] = useState(recipe.calories);
  const [nutrition, setNutrition] = useState<RecipeNutrition | null>(recipe.nutrition ?? null);
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
  /** Counts "I cooked this" taps, so the pantry can offer to take out what ran out (PIN-181). */
  const [cookedTimes, setCookedTimes] = useState(0);
  const [lastCookedAt, setLastCookedAt] = useState(recipe.last_cooked_at);
  const [cookNote, setCookNote] = useState(recipe.cook_note ?? '');
  const [activeLanguage, setActiveLanguage] = useState<RecipeLanguageCode | null>(
    localizedLanguage,
  );
  const videoPanelRef = useRef<RecipeVideoPanelHandle>(null);

  // The avoid list (PIN-105). Matched against the ingredients on screen, so a swap, a remix or a
  // translation is always reflected.
  const { profile: kitchen, reload: reloadKitchen } = useKitchenProfile();
  const kitchenLoadedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      // The hook loads on mount; coming back from Settings picks up a changed list.
      if (kitchenLoadedOnce.current) void reloadKitchen();
      kitchenLoadedOnce.current = true;
    }, [reloadKitchen]),
  );
  const avoidMatches = useMemo(
    () =>
      findAvoidMatches(
        baseIngredients.map((ing) => ing.name),
        kitchen,
      ),
    [baseIngredients, kitchen],
  );
  const hasAllergyMatches = avoidMatches.allergies.length > 0;
  const hasAvoidMatches = hasAllergyMatches || avoidMatches.dislikes.length > 0;
  const cookHasAllergies = hasAllergies(kitchen);
  /** Set while the remix sheet is open for "Make it without these". */
  const [avoidInstruction, setAvoidInstruction] = useState<string | null>(null);

  // "My appliances" (PIN-155). Not set (never saved, or signed out): nothing is checked, as before.
  const { kitchen: ownedKitchen, userId: applianceUserId } = useOwnedAppliances();
  const kitchenCheck = useMemo(() => checkKitchen(appliances, ownedKitchen), [appliances, ownedKitchen]);
  const askAboutAppliances = applianceUserId !== null && worthAskingAboutAppliances(appliances, ownedKitchen);

  /** "Make it without these": allergies, dislikes in this recipe, and appliances the kitchen doesn't have. */
  function openMakeWithout() {
    setAvoidInstruction(
      makeWithoutInstruction(
        kitchen,
        avoidMatches,
        applianceWorkaroundInstruction(kitchenCheck.missing, ownedKitchen),
      ),
    );
    setVariantModalOpen(true);
  }

  function openCookAlong(startSeconds = 0) {
    setCookAlongStartSeconds(Math.max(0, Math.round(startSeconds)));
    setCookAlongOpen(true);
  }

  const recipeCollections = recipeId ? collectionsForRecipe(recipeId) : [];

  const scaledIngredients = scaleIngredients(baseIngredients, baseServings, servings);
  const swapTarget = swapIndex != null ? scaledIngredients[swapIndex] : null;
  const calorieDisplay = getCalorieDisplay(calories, baseServings, servings);
  // PIN-80: macros are a split of Pinch's calories, so none next to calories set by hand.
  const caloriesHandSet = recipe.locked_fields?.includes('calories') === true;
  const nutritionDisplay =
    calorieDisplay != null && !caloriesHandSet
      ? getNutritionDisplay(nutrition, baseServings, servings)
      : null;
  const isUpdating = (field: RecalcField) => updatingFields.includes(field);
  const updatingLabel = t('recipeEditor.updating');
  const sourceLanguage = resolveRecipeSourceLanguage(recipe);
  /**
   * The language `originalRef`'s text is in. The recipe's own language can change after it was taken (a swap on a
   * translation), so "Revert to original" saves it with the text (PIN-187).
   */
  const originalLanguageRef = useRef(sourceLanguage);
  const contentLanguage =
    activeLanguage ?? (isRecipeLanguageCode(sourceLanguage) ? sourceLanguage : null);
  const unitLanguage = resolveCulinaryLanguage(activeLanguage, appLanguage);
  const textDirection = isRtlRecipeLanguage(contentLanguage) ? 'rtl' : 'ltr';
  // Steps quote amounts too ("3 tbsp butter") — show them in the chosen system.
  const displayInstructions = useMemo(
    () =>
      baseInstructions.map((step) => ({
        ...step,
        text: displayStepText(step.text, baseIngredients, measurementSystem, unitLanguage, units),
      })),
    [baseInstructions, baseIngredients, measurementSystem, unitLanguage, units],
  );
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
      nutrition: recipe.nutrition ?? null,
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
        nutrition: recipe.kitchen_original.nutrition ?? null,
        appliances: recipe.kitchen_original.appliances,
      };
    }
    setBaseServings(recipe.servings);
    setCalories(recipe.calories);
    setNutrition(recipe.nutrition ?? null);
    setServings(recipe.servings);
    setTags(recipe.tags ?? []);
    // An edit can complete a partial recipe: the banner follows the refreshed row.
    setExtractionStatus(recipe.extraction_status);
    // A hand edit clears the kitchen snapshot (ADR 018), so "Revert" goes with it.
    if (!recipe.kitchen_adapted_summary && !recipe.kitchen_original) {
      setKitchenAdapted((wasAdapted) => {
        if (wasAdapted) {
          setActiveVariant(null);
          setVariantSummary(null);
        }
        return false;
      });
    }
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
    recipe.nutrition,
    recipe.ingredients,
    recipe.instructions,
    recipe.tags,
    recipe.extraction_status,
    recipe.kitchen_adapted_summary,
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
      nutrition,
    };
  }, [title, baseServings, baseIngredients, baseInstructions, calories, nutrition, activeLanguage]);

  useEffect(() => {
    if (activeLanguage != null) {
      const canonical = translationSourceRef.current;
      onContentChange?.({
        title: canonical?.title ?? recipe.title,
        servings: baseServings,
        ingredients: canonical?.ingredients ?? recipe.ingredients,
        instructions: canonical?.instructions ?? recipe.instructions,
        calories,
        nutrition,
      });
      return;
    }
    onContentChange?.({
      title,
      servings: baseServings,
      ingredients: baseIngredients,
      instructions: baseInstructions,
      calories,
      nutrition,
    });
  }, [
    title,
    baseServings,
    baseIngredients,
    baseInstructions,
    calories,
    nutrition,
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
    const nextIngredients = baseIngredients.map((ing, i) =>
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
    );
    setBaseIngredients(nextIngredients);
    setBaseInstructions(nextInstructions);
    // A swap on a translation makes what is on screen the recipe's text (same as remix), so the swap persists
    // instead of echoing the pre-swap translation source. Its language is saved with it, as on the web (PIN-187):
    // without it the recipe is, say, Spanish labelled English, and the next swap or translation is told the wrong one.
    if (activeLanguage != null) {
      setActiveLanguage(null);
      onContentChange?.({
        title,
        servings: baseServings,
        ingredients: nextIngredients,
        instructions: nextInstructions,
        calories,
        nutrition,
        source_language: activeLanguage,
      });
    }
    setSwapIndex(null);
  }

  function handleApplyVariant(result: TransformedRecipePayload, variant: RecipeVariantKey) {
    // The remix was made from what is on screen. Over a translation, that translation becomes the recipe's text:
    // its title stays with the new steps and its language is saved with them, as on the web (PIN-187).
    const promotedLanguage = activeLanguage;
    // "Make it without these" (the kitchen fix) keeps the recipe as it was before, so Revert still works after
    // leaving the page, here and on the web. An earlier kept original stays the one to go back to, unless it is in
    // another language than the text saved now. A remix keeps none.
    const kitchenFix = avoidInstruction != null;
    const shown: RecipeContentSnapshot = {
      title,
      servings: baseServings,
      ingredients: baseIngredients,
      instructions: baseInstructions,
      calories,
      nutrition,
      appliances: recipe.appliances,
    };
    const earlierOriginal = promotedLanguage == null ? recipe.kitchen_original : null;
    const before: RecipeContentSnapshot = earlierOriginal ?? shown;
    setBaseServings(result.servings);
    setBaseIngredients(result.ingredients);
    setBaseInstructions(result.instructions);
    // A server from before PIN-80 sends no macros: show none rather than the old recipe's.
    const remixedNutrition = result.nutrition ?? null;
    setCalories(result.calories);
    setNutrition(remixedNutrition);
    setServings(result.servings);
    setActiveVariant(variant);
    setVariantSummary(result.summary);
    setKitchenAdapted(kitchenFix);
    if (kitchenFix) {
      originalRef.current = before;
      if (!earlierOriginal) originalLanguageRef.current = promotedLanguage ?? sourceLanguage;
    }
    setActiveLanguage(null);
    translationSourceRef.current = {
      title,
      servings: result.servings,
      ingredients: result.ingredients,
      instructions: result.instructions,
      calories: result.calories,
      nutrition: remixedNutrition,
    };
    onContentChange?.({
      title,
      servings: result.servings,
      ingredients: result.ingredients,
      instructions: result.instructions,
      calories: result.calories,
      nutrition: remixedNutrition,
      kitchen_adapted_summary: kitchenFix ? result.summary : null,
      kitchen_original: kitchenFix ? before : null,
      // The server only sends appliances when the remix changed the steps (ADR 017).
      ...(result.appliances !== undefined ? { appliances: result.appliances } : {}),
      ...(promotedLanguage != null ? { source_language: promotedLanguage } : {}),
    });
  }

  function handleRevertVariant() {
    const original = originalRef.current;
    setTitle(original.title);
    setBaseServings(original.servings);
    setBaseIngredients(original.ingredients);
    setBaseInstructions(original.instructions);
    setCalories(original.calories);
    setNutrition(original.nutrition ?? null);
    setServings(original.servings);
    setActiveVariant(null);
    setVariantSummary(null);
    setActiveLanguage(null);
    translationSourceRef.current = { ...original, nutrition: original.nutrition ?? null };
    setKitchenAdapted(false);
    onContentChange?.({
      ...original,
      nutrition: original.nutrition ?? null,
      kitchen_adapted_summary: null,
      kitchen_original: null,
      // The recipe may have taken a translation's language since (a swap or remix on one).
      source_language: originalLanguageRef.current,
    });
  }

  async function handleRepair() {
    if (repairing || extractionStatus !== 'partial' || !recipeHasSource(recipe)) return;

    if (!user) {
      router.push('/auth?mode=signup&reason=extract');
      return;
    }

    setRepairing(true);
    const canonical = translationSourceRef.current ?? {
      title: recipe.title,
      servings: baseServings,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      calories,
      nutrition,
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
        router.push('/auth?mode=signup&reason=extract');
        return;
      }
      if (result.status === 'failed' || !result.sealed_recipe || !result.reservation_id) {
        Alert.alert(
          t('recipe.repairFailedTitle'),
          serverErrorText(result, t, appLanguage, 'recipe.repairFailed', REPAIR_ERROR_KEYS),
        );
        return;
      }

      const summary = result.summary?.trim() || t('recipe.repairDefaultSummary');
      const apply = await askConfirm({
        trackId: 'recipe.repair_apply_dialog',
        title: t('recipe.repairApplyTitle'),
        message: t('recipe.repairApplyBody', { summary }),
        confirmLabel: t('recipe.repairApply'),
      });
      if (!apply) {
        if (result.reservation_id) {
          await settleRepairRecipe('abort', result.reservation_id, result.request_id);
        }
        if (result.request_id) await clearExtractionRequestId(requestKey, result.request_id);
        return;
      }

      // The server releases the repaired recipe only once the credit is committed.
      const settled = await settleRepairRecipe(
        'commit',
        result.reservation_id,
        result.request_id,
        result.sealed_recipe,
      );
      if (settled.status === 'failed' || !settled.recipe) {
        await settleRepairRecipe('abort', result.reservation_id, result.request_id);
        Alert.alert(t('recipe.repairFailedTitle'), t('recipe.repairFailed'));
        return;
      }
      if (result.request_id) await clearExtractionRequestId(requestKey, result.request_id);

      const next = settled.recipe;
      setTitle(next.title);
      setBaseServings(next.servings);
      setBaseIngredients(next.ingredients);
      setBaseInstructions(next.instructions);
      setCalories(next.calories ?? undefined);
      setNutrition(next.nutrition ?? null);
      setServings(next.servings);
      setExtractionStatus(next.extraction_status);
      setActiveLanguage(null);
      translationSourceRef.current = {
        title: next.title,
        servings: next.servings,
        ingredients: next.ingredients,
        instructions: next.instructions,
        calories: next.calories ?? undefined,
        nutrition: next.nutrition ?? null,
      };
      originalRef.current = translationSourceRef.current;
      originalLanguageRef.current = sourceLanguage;
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
        nutrition,
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
    setNutrition(prior.nutrition ?? null);
    setServings(prior.servings);
    setActiveLanguage(null);
  }

  const sourceShareUrl = recipeSourceShareUrl(recipe.original_url);
  // Saved recipes of a signed-in user get a Pinch link (PIN-110); anything else can only pass on its source.
  const pinchShareRecipeId = user && recipeId && !recipeId.startsWith('guest-') ? recipeId : null;
  // The pantry is the account's: only a signed-in person's saved recipe offers it.
  const pantryUserId = user && recipeId && !recipeId.startsWith('guest-') ? user.id : null;
  const canShare = Boolean(pinchShareRecipeId || sourceShareUrl);

  function stampCooked(openNote: boolean, from: RecipeCookedFrom) {
    if (!onCookedChange) return;
    const at = new Date().toISOString();
    // Cooking is what makes people save (and come back for) more recipes, so it is the number to watch.
    captureRecipeCooked({ from, again: Boolean(lastCookedAt) });
    setLastCookedAt(at);
    onCookedChange({ last_cooked_at: at, cook_note: cookNote });
    if (openNote) setCookedNoteOpen(true);
    if (pantryUserId) setCookedTimes((n) => n + 1);
    // Native only: may show the OS rating sheet once someone has cooked more than once (PIN-61)
    void recordCookForReviewPrompt();
  }

  async function sendShareLink(url: string) {
    try {
      const result = await shareRecipe({ title, url });
      if (result === 'copied') {
        showToast(t('recipe.linkCopied'));
      }
    } catch {
      void showNotice({ title: t('recipe.shareFailedTitle'), message: t('common.tryAgain') });
    }
  }

  // One tap straight to the share sheet, like other apps. The link stays live until the recipe
  // (or the account) is deleted; there is no separate "stop sharing" in the app (PIN-110).
  async function handleShare() {
    if (shareBusy) return;
    if (!pinchShareRecipeId) {
      if (sourceShareUrl) await sendShareLink(sourceShareUrl);
      return;
    }
    setShareBusy(true);
    const result = await createRecipeShare(pinchShareRecipeId);
    setShareBusy(false);
    if (result.status === 'ok') {
      await sendShareLink(result.url);
    } else if (sourceShareUrl) {
      await sendShareLink(sourceShareUrl);
    } else {
      void showNotice({
        title: t('recipe.shareFailedTitle'),
        message: serverErrorText(result, t, appLanguage, 'common.tryAgain', SHARE_ERROR_KEYS),
      });
    }
  }

  const translationSource = translationSourceRef.current ?? {
    title: recipe.title,
    servings: baseServings,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    calories,
    nutrition,
  };

  const sourceVideo = getRecipeVideoInfo(
    recipe.original_url,
    recipe.platform,
    recipe.source_video_url,
  );
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

  useEffect(() => {
    if (translating) announce(t('recipe.translating'));
  }, [translating, t]);

  // Sent here to start at once (the Library's "Start cooking" and play buttons): open it once, never again on a
  // re-render after the cook closes it. The screen forgets the request through onAutoStarted.
  const autoStarted = useRef(false);
  const canAutoCook = baseInstructions.length > 0;
  const canAutoPlay = sourceVideo.mode !== 'none' && Boolean(recipe.original_url);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    if (autoStart === 'cook' && canAutoCook) {
      setCookModeOpen(true);
    } else if (autoStart === 'video' && canAutoPlay) {
      setCookAlongStartSeconds(0);
      setCookAlongOpen(true);
    }
    onAutoStarted?.();
  }, [autoStart, canAutoCook, canAutoPlay, onAutoStarted]);

  function changeServings(next: number) {
    const clamped = Math.max(1, next);
    setServings(clamped);
    announce(t('cookbook.servings', { count: clamped }));
  }

  const sideCookAlong = isWide && sourceVideo.mode !== 'none';
  const splitRecipeBody = isWide && !sideCookAlong;

  // ---- Night Market layout (PIN-177) ----

  const hasPicture = Boolean(recipe.image_url) && !photoFailed;
  const overPhoto = immersive && hasPicture;
  const heroHeight = 380 + insets.top;
  const goBack = onBack ?? (() => goBackOrHome('/'));
  const hasIngredients = scaledIngredients.length > 0;
  const hasSteps = baseInstructions.length > 0;
  const useTabs = hasIngredients && hasSteps && !splitRecipeBody;
  const showIngredients = hasIngredients && (!useTabs || tab === 'ingredients');
  const showSteps = hasSteps && (!useTabs || tab === 'steps');
  const hasVideo = sourceVideo.mode !== 'none' && Boolean(recipe.original_url);
  const videoLabel = !hasVideo
    ? ''
    : sourceVideo.platform === 'web'
      ? t('cookAlong.website')
      : sourceVideo.platform === 'unknown'
        ? t('cookAlong.video')
        : getRecipePlatformLabel(sourceVideo.platform);
  const heroCookAlong: HeroCookAlong | null =
    hasVideo && !sideCookAlong
      ? {
          hint: hasStepTimestamps ? t('web.recipe.cookAlongHint', { platform: videoLabel }) : videoLabel,
          accessibilityLabel: `${t('cookAlong.title')}: ${t('cookAlong.playInPinch')}, ${videoLabel}`,
          onPress: () => openCookAlong(0),
        }
      : null;

  const source = recipeSource(recipe);
  const origin = recipeOriginChip(recipe);
  const badge = source
    ? source.platform === 'photo'
      ? t('web.recipe.savedFromPhoto')
      : t('web.recipe.savedFrom', {
          source: [source.name ?? t('web.library.sourceWebsite'), source.handle].filter(Boolean).join(' · '),
        })
    : origin === 'invented'
      ? t('recipe.inventedChip')
      : origin === 'written'
        ? t('recipeEditor.originChip')
        : null;

  // The longer the name, the smaller it is set, so it stays a headline and not a paragraph (as on the web).
  const titleFontSize = title.length <= 16 ? 34 : title.length <= 34 ? 30 : 26;
  const titleStyle: TextStyle = {
    fontSize: titleFontSize,
    lineHeight: Math.round(titleFontSize * (type.rtl ? 1.25 : 1.08)),
    letterSpacing: type.tracking(-0.03, titleFontSize),
    writingDirection: textDirection,
    textAlign: textDirection === 'rtl' ? ('right' as const) : ('left' as const),
  };

  const menuItems: RecipeMenuItem[] = [];
  if (onEdit) {
    menuItems.push({ key: 'edit', icon: 'create-outline', label: t('recipeEditor.titleEdit'), onPress: onEdit, trackId: 'recipe.title_edit' });
  }
  const fixesStart = menuItems.length > 0;
  const canRepair = allowAdaptations && extractionStatus === 'partial' && recipeHasSource(recipe);
  if (canRepair) {
    menuItems.push({
      key: 'repair',
      icon: 'construct-outline',
      label: t('recipe.repairAction'),
      hint: t('recipe.repairHint'),
      onPress: () => void handleRepair(),
      disabled: repairing,
      trackId: 'recipe.repair',
      groupStart: fixesStart,
    });
  }
  if (activeVariant != null) {
    menuItems.push({
      key: 'revert',
      icon: 'arrow-undo-outline',
      label: t('recipe.revertOriginal'),
      onPress: handleRevertVariant,
      trackId: 'recipe.remix.revert',
      groupStart: fixesStart && !canRepair,
    });
  }
  if (activeLanguage != null) {
    menuItems.push({
      key: 'original_language',
      icon: 'language-outline',
      label: t('recipe.showOriginal'),
      onPress: handleShowOriginalLanguage,
      trackId: 'recipe.show_original_language',
      groupStart: fixesStart && !canRepair && activeVariant == null,
    });
  }
  if (onDiscard) {
    menuItems.push({
      key: 'discard',
      icon: 'trash-outline',
      label: t('web.snap.discard'),
      onPress: onDiscard,
      trackId: 'recipe_preview.discard',
      danger: true,
      groupStart: menuItems.length > 0,
    });
  }

  const topActions = (variant: 'photo' | 'tile') => {
    const heart = onToggleFavorite ? (
      <IconButton
        variant={variant}
        icon={isFavorite ? 'heart' : 'heart-outline'}
        color={isFavorite ? (variant === 'photo' ? photo.scrimPrimary : colors.primary) : undefined}
        label={isFavorite ? t('library.removeFavorite') : t('library.addFavorite')}
        selected={isFavorite === true}
        trackId="recipe.favorite"
        onPress={onToggleFavorite}
      />
    ) : null;
    const share = canShare ? (
      <IconButton
        variant={variant}
        icon="share-outline"
        label={t('recipe.share')}
        trackId={pinchShareRecipeId ? 'recipe.share' : 'recipe.share_source'}
        disabled={shareBusy}
        onPress={() => void handleShare()}
      />
    ) : null;
    const more =
      menuItems.length > 0 ? (
        <IconButton
          variant={variant}
          icon="ellipsis-horizontal"
          label={t('a11y.moreOptions')}
          trackId="recipe.more"
          onPress={() => setMoreOpen(true)}
        />
      ) : null;
    if (!heart && !share && !more) return null;
    return (
      <>
        {heart}
        {share}
        {more}
      </>
    );
  };

  const hero = (
    <RecipeHero
      imageUrl={hasPicture ? recipe.image_url ?? null : null}
      aiGenerated={recipe.image_generated === true}
      onPhotoError={() => setPhotoFailed(true)}
      drawingPicture={!hasPicture && isUpdating('image')}
      immersive={immersive}
      topInset={insets.top}
      onBack={immersive ? goBack : undefined}
      actions={topActions}
      cookAlong={heroCookAlong}
    />
  );

  const showNutritionPanel = calorieDisplay != null && nutritionDisplay != null && !isUpdating('calories');
  const facts: ReactNode[] = [];
  if (isUpdating('estimated_time_minutes')) {
    facts.push(
      <RecipeUpdatingFact key="time" field={t('recipeEditor.fields.time')} label={t('web.recipe.factTime')} updating={updatingLabel} />,
    );
  } else if (recipe.estimated_time_minutes != null) {
    facts.push(
      <RecipeFact
        key="time"
        value={formatRecipeDuration(recipe.estimated_time_minutes, durationLabels)}
        label={t('web.recipe.factTime')}
      />,
    );
  }
  facts.push(
    <RecipeFact
      key="servings"
      value={servings}
      label={t('recipe.servings')}
      spoken={t('cookbook.servings', { count: servings })}
    />,
  );
  if (isUpdating('calories')) {
    facts.push(
      <RecipeUpdatingFact key="calories" field={t('recipeEditor.fields.calories')} label={t('web.recipe.factCalories')} updating={updatingLabel} />,
    );
  } else if (calorieDisplay != null && !showNutritionPanel) {
    // With the macros, calories sit in the per-serving panel instead.
    facts.push(
      <RecipeFact
        key="calories"
        value={calorieDisplay.perServing.toLocaleString()}
        label={t('web.recipe.factCalories')}
        spoken={t('recipe.calPerServing', { count: calorieDisplay.perServing })}
      />,
    );
  }
  if (isUpdating('cost_estimate')) {
    facts.push(
      <RecipeUpdatingFact key="cost" field={t('recipeEditor.fields.cost')} label={t('web.recipe.factCost')} updating={updatingLabel} />,
    );
  } else if (recipe.cost_estimate) {
    facts.push(
      <RecipeFact
        key="cost"
        value={<CostDots tier={recipe.cost_estimate} />}
        label={costLabels[recipe.cost_estimate]}
        spoken={t('recipe.cost.a11y', {
          label: costLabels[recipe.cost_estimate],
          count: costFilledCount(recipe.cost_estimate),
        })}
      />,
    );
  }

  const startCooking = () => setCookModeOpen(true);
  const showBar = immersive && (hasSteps || hasIngredients || primaryAction != null);
  const barIconStyle = { width: 56, height: 56, borderRadius: 16 };
  const contentWidth =
    isMediumUp && !sideCookAlong
      ? { width: '100%' as const, maxWidth: splitRecipeBody ? 1040 : RecipeReadingWidth, alignSelf: 'center' as const }
      : null;

  const ingredientsSection = showIngredients ? (
    <View style={{ gap: 12, minWidth: 0, flex: splitRecipeBody ? 1 : undefined }}>
      {!useTabs ? (
        <SectionHeading
          title={t('recipe.ingredients')}
          count={t('recipe.itemCount', {
            count: scaledIngredients.length,
          })}
        />
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Stepper
          value={servings}
          onChange={changeServings}
          min={1}
          label={t('recipe.servings')}
          decreaseLabel={t('recipe.decreaseServings')}
          increaseLabel={t('recipe.increaseServings')}
          spokenValue={t('cookbook.servings', { count: servings })}
          trackId="recipe.servings"
        >
          {/* A person icon and the count, so the stepper and spoons/grams share a row on a phone. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <KitIcon icon="people-outline" size={16} color={colors.textSecondary} />
            <Text
              numberOfLines={1}
              style={{ ...type.font('body', 'bold'), fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] }}
            >
              {servings}
            </Text>
          </View>
        </Stepper>
        <MeasurementToggle compact trackId="recipe.measurement" />
      </View>
      {calorieDisplay != null ? (
        <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {nutritionDisplay != null && !isUpdating('calories')
            ? t('recipe.nutritionTotal', {
                calories: calorieDisplay.total.toLocaleString(),
                protein: nutritionDisplay.total.protein_g.toLocaleString(),
                carbs: nutritionDisplay.total.carbs_g.toLocaleString(),
                fat: nutritionDisplay.total.fat_g.toLocaleString(),
              })
            : t('recipe.calTotal', { count: calorieDisplay.total.toLocaleString() })}
        </Text>
      ) : null}
      {measurementSystem === 'metric' ? (
        <Text variant="caption" tone="muted">
          {t('measurement.metricHint')}
        </Text>
      ) : null}
      {isUpdating('ingredient_amounts') ? (
        <UpdatingText label={updatingLabel} field={t('recipeEditor.fields.quantity')} />
      ) : null}
      <RecipeIngredientList
        rows={scaledIngredients.map((ing, index) => ({
          key: `${ing.name}-${index}`,
          name: ing.name,
          amount:
            displayIngredientAmount(ing, { system: measurementSystem, language: unitLanguage, units }) ||
            t('recipe.amountUnknown'),
          isPinch: displayedAmountIsPinch(ing, { system: measurementSystem }),
          avoid: avoidMatches.byIngredient[index] ?? null,
          updating: isUpdating('ingredient_amounts') && !ing.metric && !ing.spoons,
        }))}
        direction={textDirection}
        rowDirection={recipeRowDirection}
        onSwap={allowAdaptations ? (index) => setSwapIndex(index) : undefined}
        updatingLabel={updatingLabel}
      />
      {hasUnknownAmounts && recipeHasSource(recipe) ? (
        <Text variant="caption" tone="muted">
          {t('recipe.amountsUnknownHint')}
        </Text>
      ) : null}
      {!immersive ? (
        <Button
          variant="outline"
          fullWidth
          icon="cart-outline"
          trackId="recipe.add_to_shopping_list"
          onPress={() => setShoppingListModalOpen(true)}
        >
          {t('addToList.title')}
        </Button>
      ) : null}
    </View>
  ) : null;

  const stepCount = t('recipe.stepCount', {
    count: baseInstructions.length,
  });
  const stepsSection = showSteps ? (
    <View style={{ gap: 12, minWidth: 0, flex: splitRecipeBody ? 1.2 : undefined }}>
      {!useTabs ? (
        <SectionHeading title={t('recipe.instructions')} count={stepCount} />
      ) : (
        <Text variant="caption" tone="muted">
          {hasStepTimestamps && hasVideo ? `${stepCount} · ${t('recipe.tapTimeToJump')}` : stepCount}
        </Text>
      )}
      {!useTabs && hasStepTimestamps && hasVideo ? (
        <Text variant="caption" tone="muted" style={{ marginTop: -6 }}>
          {t('recipe.tapTimeToJump')}
        </Text>
      ) : null}
      <RecipeStepList
        steps={displayInstructions}
        direction={textDirection}
        rowDirection={recipeRowDirection}
        onJump={hasVideo ? (seconds) => void handleStepTimestamp(seconds) : undefined}
      />
    </View>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      {immersive ? (
        <StatusBar style={overPhoto && !pastPhoto ? 'light' : scheme === 'dark' ? 'light' : 'dark'} />
      ) : null}
      <View
        style={
          sideCookAlong
            ? { flex: 1, flexDirection: 'row', width: '100%', maxWidth: 1200, alignSelf: 'center' }
            : { flex: 1 }
        }
      >
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={
            overPhoto
              ? (event) => {
                  const past = event.nativeEvent.contentOffset.y > heroHeight - insets.top - HERO_OVERLAP;
                  if (past !== pastPhoto) setPastPhoto(past);
                }
              : undefined
          }
          contentContainerStyle={{
            paddingBottom: 24 + (sideCookAlong ? 0 : cookAlongSheetHeight) + (showBar ? barHeight : 0),
          }}
        >
          {immersive ? hero : null}
          <View
            style={[
              { paddingHorizontal: 16, paddingTop: overPhoto ? 20 : 16 },
              overPhoto
                ? {
                    marginTop: -HERO_OVERLAP,
                    borderTopStartRadius: Radii.tile,
                    borderTopEndRadius: Radii.tile,
                    backgroundColor: colors.background,
                  }
                : null,
            ]}
          >
            <View style={[{ gap: 16 }, contentWidth]}>
              {!immersive ? hero : null}
              {topNotice}

              <Tile padding={20} style={{ gap: 14 }}>
                {badge ? <TileBadge>{badge}</TileBadge> : null}
                <Text variant="h1" style={titleStyle}>
                  {title}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>{facts}</View>
                {showNutritionPanel ? (
                  <RecipeNutritionPanel calories={calorieDisplay.perServing} nutrition={nutritionDisplay.perServing} />
                ) : null}

                {tags.length > 0 ||
                recipeId ||
                isUpdating('tags') ||
                recipe.effort_level ||
                isUpdating('effort_level') ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    {isUpdating('effort_level') ? (
                      <UpdatingText label={updatingLabel} field={t('recipeEditor.fields.effort')} />
                    ) : recipe.effort_level ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          height: 32,
                          paddingHorizontal: 12,
                          borderRadius: Radii.pill,
                          backgroundColor: colors.accentSoft,
                        }}
                      >
                        <KitIcon icon="speedometer-outline" size={14} color={colors.accentText} />
                        <Text tone="accent" style={{ ...type.font('body', 'semibold'), fontSize: 13, lineHeight: 16 }}>
                          {t(`recipe.effort.${recipe.effort_level.toLowerCase()}`)}
                        </Text>
                      </View>
                    ) : null}
                    {tags.map((tag) => (
                      <Chip
                        key={tag}
                        size="sm"
                        trackId="recipe.tag.open"
                        onPress={() =>
                          // The Library shows "Back to <recipe>" when it knows where the tag came from.
                          router.dismissTo({
                            pathname: '/',
                            params: recipeId ? { tag, from: recipeId, fromTitle: recipe.title } : { tag },
                          })
                        }
                        accessibilityLabel={t('a11y.showRecipesTagged', { tag: translateRecipeTag(tag, t) })}
                      >
                        {translateRecipeTag(tag, t)}
                      </Chip>
                    ))}
                    {isUpdating('tags') ? (
                      <UpdatingText label={updatingLabel} field={t('recipeEditor.fields.tags')} />
                    ) : null}
                    {recipeId ? (
                      <Chip
                        size="sm"
                        icon={tags.length > 0 ? 'pricetag-outline' : 'add'}
                        trackId="recipe.tags.edit"
                        onPress={() => setEditTagsOpen(true)}
                      >
                        {tags.length > 0 ? t('tags.editTitle') : t('tags.addTags')}
                      </Chip>
                    ) : null}
                  </View>
                ) : null}

                {recipeId && recipeCollections.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {recipeCollections.map((collection) => (
                      <Chip
                        key={collection.id}
                        size="sm"
                        icon="folder-outline"
                        trackId="recipe.collection.open"
                        onPress={() => router.dismissTo({ pathname: '/', params: { collection: collection.id } })}
                        accessibilityLabel={t('a11y.openCollection', { name: collection.name })}
                      >
                        {collection.name}
                      </Chip>
                    ))}
                  </View>
                ) : null}

                {onCookedChange ? (
                  <View style={{ gap: 10 }}>
                    {lastCookedAt && cookedDateLabel ? (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                        <View style={{ paddingTop: 3 }}>
                          <KitIcon icon="calendar-outline" size={16} color={colors.textSecondary} />
                        </View>
                        <Text variant="bodySmall" tone="muted" style={{ flex: 1, minWidth: 0 }}>
                          {cookNote.trim()
                            ? t('recipe.cookedOnWithNote', { date: cookedDateLabel, note: cookNote.trim() })
                            : t('recipe.cookedOn', { date: cookedDateLabel })}
                        </Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        icon="checkmark-circle-outline"
                        trackId="recipe.cooked.toggle"
                        onPress={() => stampCooked(!lastCookedAt, 'recipe')}
                      >
                        {lastCookedAt ? t('recipe.cookedAgain') : t('recipe.cookedAction')}
                      </Button>
                      {lastCookedAt ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="create-outline"
                          trackId="recipe.cooked.note"
                          onPress={() => setCookedNoteOpen(true)}
                        >
                          {t('recipe.cookedNoteTitle')}
                        </Button>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {(hasVideo && !hasPicture && !sideCookAlong) || (!immersive && hasSteps) ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {!immersive && hasSteps ? (
                      <Button
                        variant="secondary"
                        icon="restaurant-outline"
                        trackId="recipe.cook_mode.open"
                        accessibilityLabel={t('web.library.startCooking')}
                        onPress={startCooking}
                        style={{ flexGrow: 1 }}
                      >
                        {t('web.library.startCooking')}
                      </Button>
                    ) : null}
                    {hasVideo && !hasPicture && !sideCookAlong ? (
                      <Button
                        variant="secondary"
                        icon="play"
                        trackId="recipe.video.play"
                        accessibilityLabel={heroCookAlong?.accessibilityLabel}
                        onPress={() => openCookAlong(0)}
                        style={{ flexGrow: 1 }}
                      >
                        {t('web.library.cookAlongVideo')}
                      </Button>
                    ) : null}
                  </View>
                ) : null}
              </Tile>

              {translating ? (
                <RecipeNotice icon="language-outline" title={t('recipe.translating')} accessibilityLiveRegion="polite" />
              ) : null}

              {activeLanguage != null ? (
                <RecipeNotice
                  tone="primary"
                  icon="language-outline"
                  title={t('recipe.showingLanguage', { language: t(`languages.${activeLanguage}`) })}
                  actions={
                    <Button variant="link" trackId="recipe.show_original_language" onPress={handleShowOriginalLanguage}>
                      {t('recipe.showOriginal')}
                    </Button>
                  }
                />
              ) : null}

              {activeVariant != null ? (
                <RecipeNotice
                  tone="primary"
                  icon="color-wand-outline"
                  title={
                    kitchenAdapted
                      ? t('recipe.kitchenAdapted')
                      : t('recipe.variantVersion', { variant: t(`recipe.variants.${activeVariant}.label`) })
                  }
                  actions={
                    <Button variant="link" trackId="recipe.remix.revert" onPress={handleRevertVariant}>
                      {t('recipe.revertOriginal')}
                    </Button>
                  }
                >
                  {variantSummary != null ? <Text variant="bodySmall">{variantSummary}</Text> : null}
                  {cookHasAllergies ? (
                    <Text variant="caption" tone="muted">
                      {t('avoid.checkLabels')}
                    </Text>
                  ) : null}
                </RecipeNotice>
              ) : null}

              {hasAvoidMatches ? (
                <RecipeNotice
                  tone={hasAllergyMatches ? 'warning' : 'surface'}
                  icon={hasAllergyMatches ? 'alert-circle' : 'remove-circle-outline'}
                  title={hasAllergyMatches ? t('avoid.bannerAllergyTitle') : t('avoid.bannerDislikeTitle')}
                  actions={
                    allowAdaptations ? (
                      <Button
                        variant={hasAllergyMatches ? 'primary' : 'secondary'}
                        size="sm"
                        trackId="recipe.avoid.make_without"
                        onPress={openMakeWithout}
                      >
                        {t('avoid.makeWithout')}
                      </Button>
                    ) : undefined
                  }
                >
                  {avoidMatches.allergies.map((hit) => (
                    <Text key={hit.item} variant="bodySmall">
                      <Text variant="bodySmall" weight="semibold">
                        {hit.allergen ? t(`avoid.allergens.${hit.allergen}`) : hit.item}:{' '}
                      </Text>
                      {hit.ingredients.join(', ')}
                    </Text>
                  ))}
                  {hasAllergyMatches && avoidMatches.dislikes.length > 0 ? (
                    <Text variant="bodySmall" weight="semibold" accessibilityRole="header" style={{ marginTop: 4 }}>
                      {t('avoid.bannerDislikeTitle')}
                    </Text>
                  ) : null}
                  {avoidMatches.dislikes.map((hit) => (
                    <Text key={hit.item} variant="bodySmall" tone="muted">
                      <Text variant="bodySmall" weight="semibold" tone="muted">
                        {hit.item}:{' '}
                      </Text>
                      {hit.ingredients.join(', ')}
                    </Text>
                  ))}
                  {hasAllergyMatches ? (
                    <Text variant="caption" tone="muted">
                      {t('avoid.checkLabels')}
                    </Text>
                  ) : null}
                </RecipeNotice>
              ) : null}

              {recipeIsInvented(recipe) ? (
                <RecipeNotice
                  tone="accent"
                  icon="bulb-outline"
                  title={t('recipe.inventedChip')}
                  accessible
                  accessibilityLabel={`${t('recipe.inventedChip')}. ${t('recipe.inventedBanner')}`}
                >
                  <Text variant="caption" tone="muted">
                    {t('recipe.inventedBanner')}
                  </Text>
                </RecipeNotice>
              ) : null}

              {extractionStatus === 'partial' && recipeIsInvented(recipe) ? (
                <RecipeNotice tone="warning" icon="alert-circle" title={t('recipe.inventedPartial')} />
              ) : null}

              {extractionStatus === 'partial' && recipeHasSource(recipe) ? (
                <RecipeNotice
                  tone="warning"
                  icon="alert-circle"
                  title={t('recipe.partialExtraction')}
                  actions={
                    allowAdaptations ? (
                      <Button
                        size="sm"
                        icon="construct-outline"
                        trackId="recipe.repair"
                        busy={repairing}
                        onPress={() => void handleRepair()}
                      >
                        {t('recipe.repairAction')}
                      </Button>
                    ) : undefined
                  }
                >
                  <Text variant="caption" tone="muted">
                    {t('recipe.repairHint')}
                  </Text>
                </RecipeNotice>
              ) : null}

              {allowAdaptations ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Button
                    variant="outline"
                    icon="color-wand-outline"
                    trackId="recipe.remix.open"
                    onPress={() => setVariantModalOpen(true)}
                    style={{ flex: 1, paddingHorizontal: 12 }}
                  >
                    {t('recipe.remix')}
                  </Button>
                  <Button
                    variant="outline"
                    icon="language-outline"
                    trackId="recipe.translate"
                    onPress={() => setTranslateModalOpen(true)}
                    style={{ flex: 1, paddingHorizontal: 12 }}
                  >
                    {t('recipe.translate')}
                  </Button>
                  {recipeId ? (
                    <IconButton
                      variant="tile"
                      icon="folder-outline"
                      label={t('library.addToCollection')}
                      trackId="recipe.add_to_collection"
                      onPress={() => setCollectionModalOpen(true)}
                      style={{ width: 48, height: 48 }}
                    />
                  ) : null}
                </View>
              ) : null}

              <RecipeAppliances
                appliances={appliances}
                instructions={displayInstructions}
                stepDirection={textDirection}
                updating={isUpdating('appliances')}
                kitchen={ownedKitchen}
                footer={
                  kitchenCheck.covered.length > 0 || kitchenCheck.ready || askAboutAppliances ? (
                    <View style={{ gap: 6 }}>
                      {kitchenCheck.covered.map(({ key, alternative }) => (
                        <View
                          key={key}
                          testID={`appliance-covered-${key}`}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                        >
                          <KitIcon icon="checkmark" size={14} color={colors.success} />
                          <Text variant="caption" tone="muted" style={{ flex: 1, minWidth: 0 }}>
                            <Text variant="caption" weight="semibold">
                              {t(applianceNameKey(key))}:{' '}
                            </Text>
                            {isApplianceKey(alternative)
                              ? t('myAppliances.standInWorks', { alternative: t(applianceNameKey(alternative)) })
                              : t('appliances.alternative', {
                                  alternative: t(`appliances.alternatives.${alternative}`),
                                })}
                          </Text>
                        </View>
                      ))}
                      {kitchenCheck.ready ? (
                        <View testID="appliances-ready" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <KitIcon icon="checkmark-circle" size={14} color={colors.success} />
                          <Text variant="caption" weight="semibold" tone="success">
                            {t('myAppliances.haveEverything')}
                          </Text>
                        </View>
                      ) : null}
                      {askAboutAppliances ? (
                        <Button
                          variant="link"
                          trackId="recipe.appliances.ask"
                          testID="appliances-ask"
                          onPress={() => router.push('/settings/recipe')}
                        >
                          {t('myAppliances.askLink')}
                        </Button>
                      ) : null}
                    </View>
                  ) : null
                }
              />

              {kitchenCheck.missing.length > 0 ? (
                <RecipeNotice
                  testID="appliances-missing"
                  tone="warning"
                  icon="alert-circle"
                  title={t('myAppliances.missingTitle')}
                  actions={
                    <>
                      {allowAdaptations ? (
                        <Button variant="secondary" size="sm" trackId="recipe.appliances.make_without" onPress={openMakeWithout}>
                          {t('avoid.makeWithout')}
                        </Button>
                      ) : null}
                      <Button variant="link" trackId="recipe.appliances.edit" onPress={() => router.push('/settings/recipe')}>
                        {t('myAppliances.editLink')}
                      </Button>
                    </>
                  }
                >
                  <Text variant="bodySmall" weight="semibold">
                    {kitchenCheck.missing.map((key) => t(applianceNameKey(key))).join(', ')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {allowAdaptations
                      ? t('myAppliances.missingFix', { count: kitchenCheck.missing.length })
                      : t('myAppliances.missingNoFix', { count: kitchenCheck.missing.length })}
                  </Text>
                </RecipeNotice>
              ) : null}

              {useTabs ? (
                <SegmentedControl<RecipeTab>
                  kind="tabs"
                  fullWidth
                  label={t('web.recipe.tabs')}
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: 'ingredients', label: t('recipe.ingredients'), trackId: 'recipe.tab.ingredients' },
                    { value: 'steps', label: t('web.recipe.steps'), trackId: 'recipe.tab.steps' },
                  ]}
                />
              ) : null}

              {splitRecipeBody ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 24 }}>
                  {ingredientsSection}
                  {stepsSection}
                </View>
              ) : (
                <>
                  {ingredientsSection}
                  {stepsSection}
                </>
              )}

              {footer}
            </View>
          </View>
        </ScrollView>

        {sideCookAlong ? (
          <View
            style={{
              width: cookAlongOpen ? 440 : 360,
              paddingTop: 16,
              paddingEnd: 20,
              paddingBottom: 16,
              paddingStart: 8,
              alignSelf: cookAlongOpen ? 'stretch' : 'flex-start',
              // Keep cook-along visible while the recipe scrolls (web).
              position: 'sticky' as 'relative',
              top: cookAlongOpen ? 0 : 16,
              // Full remaining viewport so Reels / TikTok can play portrait-tall.
              ...(cookAlongOpen
                ? {
                    height: viewportHeight - (immersive ? 0 : WEB_RECIPE_HEADER),
                    maxHeight: viewportHeight - (immersive ? 0 : WEB_RECIPE_HEADER),
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

      {/* Under the status bar once the photo has scrolled away, so the page doesn't run under the clock. */}
      {immersive && insets.top > 0 && (!overPhoto || pastPhoto) ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, start: 0, end: 0, height: insets.top, backgroundColor: colors.background }}
        />
      ) : null}

      {showBar ? (
        <RecipeCookBar onHeight={setBarHeight}>
          {primaryAction ? (
            <>
              <Button
                size="lg"
                busy={primaryAction.busy}
                trackId={primaryAction.trackId}
                onPress={primaryAction.onPress}
                style={{ flex: 1 }}
              >
                {primaryAction.label}
              </Button>
              {hasSteps ? (
                <IconButton
                  variant="tile"
                  icon="restaurant-outline"
                  label={t('web.library.startCooking')}
                  trackId="recipe.cook_mode.open"
                  onPress={startCooking}
                  style={barIconStyle}
                />
              ) : null}
            </>
          ) : hasSteps ? (
            <Button
              size="lg"
              icon="restaurant-outline"
              trackId="recipe.cook_mode.open"
              accessibilityLabel={t('web.library.startCooking')}
              onPress={startCooking}
              style={{ flex: 1 }}
            >
              {t('web.library.startCooking')}
            </Button>
          ) : null}
          {hasIngredients ? (
            <IconButton
              variant="tile"
              icon="cart-outline"
              label={t('addToList.title')}
              trackId="recipe.add_to_shopping_list"
              onPress={() => setShoppingListModalOpen(true)}
              style={barIconStyle}
            />
          ) : null}
        </RecipeCookBar>
      ) : null}

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
      <RecipeMoreMenu visible={moreOpen} title={title} items={menuItems} onClose={() => setMoreOpen(false)} />

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
                ? `\n\n${t('recipe.alreadyOnListNamed', { name: result.alreadyOnList[0] })}`
                : `\n\n${t('recipe.alreadyOnList', { count: result.alreadyOnList.length })}`;
          Alert.alert(
            t('recipe.addedToList'),
            `${t('recipe.addedToListBody', { count: selected.length })}${dupNote}`,
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
        language={contentLanguage}
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
        presetInstruction={avoidInstruction}
        allergyInstruction={allergyInstruction(kitchen)}
        notice={cookHasAllergies ? t('avoid.checkLabels') : undefined}
        onClose={() => {
          setVariantModalOpen(false);
          setAvoidInstruction(null);
        }}
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
          instructions={displayInstructions}
          textDirection={textDirection}
          contentLanguage={contentLanguage}
          onClose={() => setCookModeOpen(false)}
          onCooked={
            onCookedChange
              ? () => {
                  setCookModeOpen(false);
                  stampCooked(!lastCookedAt, 'cook_mode');
                }
              : undefined
          }
        />
      ) : null}

      {onCookedChange && pantryUserId ? (
        <PantryUsedUpOffer
          trigger={cookedTimes}
          ingredients={[...(recipe.ingredients ?? []), ...scaledIngredients]}
          blocked={cookedNoteOpen || cookModeOpen}
          userId={pantryUserId}
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

type RecipeTab = 'ingredients' | 'steps';

/** A section's title (h2) with its count beside it: "Ingredients  8 items". */
function SectionHeading({ title, count }: { title: string; count?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 10 }}>
      <Text variant="h2">{title}</Text>
      {count ? (
        <Text variant="bodySmall" tone="muted">
          {count}
        </Text>
      ) : null}
    </View>
  );
}

/** "Updating…" next to a value that keeps showing until the recalculated one arrives (ADR 018). */
function UpdatingText({ label, field }: { label: string; field: string }) {
  return (
    <Text
      variant="caption"
      weight="medium"
      tone="muted"
      accessibilityLabel={`${field}, ${label}`}
      accessibilityState={{ busy: true }}
    >
      {label}
    </Text>
  );
}
