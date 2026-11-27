/**
 * What RecipeView hands the screen to save when a swap, a remix or a revert changes a recipe that is showing a
 * translation (PIN-187). Everything it draws is replaced by stand-ins that keep their props, so the test calls
 * `onSwap`, `onApply` and the menu's Revert the way the real pieces do. The harness saves like the recipe screen.
 * React Native Testing Library v14: render is async, always await it.
 */
import { act, render } from '@testing-library/react-native';
import { useCallback, useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recipeContentEquals } from '@shared/lib/recipeContentEquals';
import type { Recipe, RecipeTranslationContent } from '@shared/types/recipe';

import { RecipeView } from './RecipeView';

type Props = Record<string, any>;

const h = vi.hoisted(() => {
  const seen: Record<string, Record<string, any>> = {};
  const buttons: Record<string, () => void> = {};
  /** A stand-in that keeps its latest props. Containers draw their children, so what is inside them mounts too. */
  const standIn = (name: string, container = false) => (props: Record<string, any>) => {
    seen[name] = props;
    return container ? (props.children ?? null) : null;
  };
  return {
    seen,
    buttons,
    standIn,
    kitchen: { allergies: [], otherAllergies: [], dislikes: [] as string[] },
    addFromRecipe: vi.fn(async () => ({ items: [], alreadyOnList: [] as string[] })),
  };
});

vi.mock('expo-router', () => ({ router: { push: vi.fn() }, useFocusEffect: () => undefined }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

vi.mock('@/components/MeasurementToggle', () => ({ MeasurementToggle: h.standIn('MeasurementToggle') }));
vi.mock('@/components/AddToCollectionModal', () => ({ AddToCollectionModal: h.standIn('AddToCollectionModal') }));
vi.mock('@/components/plan/AddToPlanSheet', () => ({ AddToPlanSheet: h.standIn('AddToPlanSheet') }));
vi.mock('@/components/AddToShoppingListModal', () => ({ AddToShoppingListModal: h.standIn('AddToShoppingListModal') }));
vi.mock('@/components/CookAlongVideoModal', () => ({ CookAlongVideoModal: h.standIn('CookAlongVideoModal') }));
vi.mock('@/components/CookMode', () => ({ CookMode: h.standIn('CookMode') }));
vi.mock('@/components/CookedNoteModal', () => ({ CookedNoteModal: h.standIn('CookedNoteModal') }));
vi.mock('@/components/pantry/PantryUsedUpSheet', () => ({ PantryUsedUpOffer: h.standIn('PantryUsedUpOffer') }));
vi.mock('@/components/RecipeAppliances', () => ({ RecipeAppliances: h.standIn('RecipeAppliances') }));
vi.mock('@/components/EditTagsModal', () => ({ EditTagsModal: h.standIn('EditTagsModal') }));
vi.mock('@/components/RecipeVideoPanel', () => ({ RecipeVideoPanel: h.standIn('RecipeVideoPanel') }));
vi.mock('@/components/RecipeTranslateModal', () => ({ RecipeTranslateModal: h.standIn('RecipeTranslateModal') }));
vi.mock('@/components/RecipeVariantModal', () => ({ RecipeVariantModal: h.standIn('RecipeVariantModal') }));
vi.mock('@/components/SubstitutionModal', () => ({ SubstitutionModal: h.standIn('SubstitutionModal') }));
vi.mock('@/components/TokenPurchaseSheet', () => ({ TokenPurchaseSheet: h.standIn('TokenPurchaseSheet') }));
vi.mock('@/components/recipe/RecipeCookBar', () => ({ RecipeCookBar: h.standIn('RecipeCookBar') }));
vi.mock('@/components/recipe/RecipeFact', () => ({
  CostDots: h.standIn('CostDots'),
  RecipeFact: h.standIn('RecipeFact'),
  RecipeUpdatingFact: h.standIn('RecipeUpdatingFact'),
}));
vi.mock('@/components/recipe/RecipeHero', () => ({
  HERO_OVERLAP: 0,
  HERO_TOP_ROW_OFFSET: 0,
  RecipeHero: h.standIn('RecipeHero'),
  RecipeHeroTopRow: h.standIn('RecipeHeroTopRow'),
}));
vi.mock('@/components/recipe/RecipeIngredientList', () => ({ RecipeIngredientList: h.standIn('RecipeIngredientList') }));
vi.mock('@/components/recipe/RecipeMoreMenu', () => ({ RecipeMoreMenu: h.standIn('RecipeMoreMenu') }));
// A notice's buttons are in `actions`: draw them, so "Make it without these" can be pressed.
vi.mock('@/components/recipe/RecipeNotice', () => ({
  RecipeNotice: (props: Record<string, any>) => props.actions ?? null,
}));
vi.mock('@/components/recipe/RecipeStepList', () => ({ RecipeStepList: h.standIn('RecipeStepList') }));
vi.mock('@/components/ui/Button', () => ({
  Button: (props: Record<string, any>) => {
    h.buttons[props.trackId] = props.onPress;
    return null;
  },
}));
vi.mock('@/components/ui/Chip', () => ({ Chip: h.standIn('Chip') }));
vi.mock('@/components/ui/IconButton', () => ({ IconButton: h.standIn('IconButton') }));
vi.mock('@/components/ui/SegmentedControl', () => ({ SegmentedControl: h.standIn('SegmentedControl') }));
vi.mock('@/components/ui/Stepper', () => ({ Stepper: h.standIn('Stepper') }));
vi.mock('@/components/ui/Text', () => ({ Text: h.standIn('Text') }));
vi.mock('@/components/ui/Tile', () => ({ Tile: h.standIn('Tile', true), TileBadge: h.standIn('TileBadge') }));
vi.mock('@/components/ui/tokens', () => ({ KitIcon: () => null, Radii: {}, usePhotoColors: () => ({}) }));
vi.mock('@/constants/theme', () => ({ RecipeReadingWidth: 720 }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ isWide: false, isMediumUp: false, height: 800, width: 400 }),
}));
vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => ({
    collections: [],
    createCollection: vi.fn(),
    setMembershipsForRecipe: vi.fn(),
    collectionsForRecipe: () => [],
  }),
}));
vi.mock('@/hooks/useKitchenProfile', () => ({ useKitchenProfile: () => ({ profile: h.kitchen, reload: vi.fn() }) }));
vi.mock('@/hooks/useOwnedAppliances', () => ({ useOwnedAppliances: () => ({ kitchen: null, userId: null }) }));
vi.mock('@/hooks/useLanguagePreference', () => ({ useLanguagePreference: () => ({ language: 'es' }) }));
vi.mock('@/hooks/useMeasurementPreference', () => ({ useMeasurementPreference: () => ({ system: 'original' }) }));
vi.mock('@/hooks/useUnitSystemPreference', () => ({ useUnitSystemPreference: () => ({ units: 'metric' }) }));
vi.mock('@/hooks/useShoppingList', () => ({ useShoppingList: () => ({ addFromRecipe: h.addFromRecipe }) }));
vi.mock('@/hooks/useThemePreference', () => ({ useThemePreference: () => ({ colors: {}, scheme: 'light' }) }));
vi.mock('@/hooks/useTypography', () => ({
  useTypography: () => ({ rtl: false, tracking: () => 0, font: () => ({}) }),
}));

vi.mock('@/lib/a11y', () => ({ announce: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ captureRecipeCooked: vi.fn() }));
vi.mock('@/lib/dialog', () => ({ askConfirm: vi.fn(), showNotice: vi.fn() }));
vi.mock('@/lib/extractionRequestId', () => ({ clearExtractionRequestId: vi.fn() }));
vi.mock('@/lib/goBackOrHome', () => ({ goBackOrHome: vi.fn() }));
vi.mock('@/lib/haptics', () => ({
  haptics: { saved: vi.fn(), step: vi.fn(), timerDone: vi.fn(), cooked: vi.fn(), tick: vi.fn(), refresh: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/guestRecipes', () => ({ setGuestRecipeTags: vi.fn() }));
vi.mock('@/lib/recipeVideo', () => ({
  getRecipePlatformLabel: () => '',
  getRecipeVideoInfo: () => ({ mode: 'none' }),
}));
vi.mock('@/lib/reviewPrompt', () => ({ recordCookForReviewPrompt: vi.fn() }));
vi.mock('@/lib/shareRecipe', () => ({ recipeSourceShareUrl: () => null, shareRecipe: vi.fn() }));
vi.mock('@/lib/supabase/repairRecipe', () => ({
  repairRecipe: vi.fn(),
  repairRequestKey: vi.fn(),
  settleRepairRecipe: vi.fn(),
}));
vi.mock('@shared/lib/supabase/recipeShare', () => ({ createRecipeShare: vi.fn() }));
vi.mock('@shared/lib/supabase/recipes', () => ({ setRecipeTags: vi.fn() }));

const english = {
  id: 'r1',
  user_id: 'user-1',
  created_at: '2026-11-01T00:00:00Z',
  title: 'Creamy tomato pasta',
  servings: 2,
  source_language: 'en',
  extraction_status: 'full',
  ingredients: [
    { name: 'pasta', quantity: 200, unit: 'g' },
    { name: 'cream', quantity: 100, unit: 'ml' },
  ],
  instructions: [
    { step: 1, text: 'Boil the pasta until tender.' },
    { step: 2, text: 'Stir in the cream and heat through.' },
  ],
} as unknown as Recipe;

const spanish: RecipeTranslationContent = {
  title: 'Pasta cremosa con tomate',
  ingredients: [
    { name: 'pasta', quantity: 200, unit: 'g' },
    { name: 'nata', quantity: 100, unit: 'ml' },
  ],
  instructions: [
    { step: 1, text: 'Hierve la pasta hasta que esté tierna.' },
    { step: 2, text: 'Añade la nata y calienta.' },
  ],
};

const oatCream = { name: 'crema de avena', quantity: 100, unit: 'ml' };
const stepsWithOatCream = [spanish.instructions[0], { step: 2, text: 'Añade la crema de avena y calienta.' }];

const veganRemix = {
  servings: 2,
  ingredients: [
    { name: 'pasta', quantity: 200, unit: 'g' },
    { name: 'crema de anacardos', quantity: 120, unit: 'ml' },
  ],
  instructions: [
    { step: 1, text: 'Hierve la pasta hasta que esté tierna.' },
    { step: 2, text: 'Añade la crema de anacardos y calienta.' },
  ],
  calories: 480,
  nutrition: null,
  summary: 'Sin lácteos.',
};

type Saved = Record<string, any>;
let saved: Saved[] = [];

/**
 * The recipe screen around RecipeView: it saves a change unless it is an echo of what it already has, and shows the
 * Spanish translation for as long as the recipe itself is not Spanish (the app language here).
 */
function Screen({ recipe: initial, translated }: { recipe: Recipe; translated: boolean }) {
  const [recipe, setRecipe] = useState(initial);
  const current = useRef(recipe);
  const onContentChange = useCallback((content: Saved) => {
    const kitchenTouched = content.kitchen_adapted_summary !== undefined;
    const languageChanged =
      content.source_language !== undefined && content.source_language !== current.current.source_language;
    if (recipeContentEquals(current.current, content as Recipe) && !kitchenTouched && !languageChanged) return;
    saved.push(content);
    const { kitchen_adapted_summary: summary, kitchen_original: original, ...rest } = content;
    const next = { ...current.current, ...rest } as Recipe;
    if (summary === null) {
      delete next.kitchen_adapted_summary;
      delete next.kitchen_original;
    } else if (summary !== undefined) {
      next.kitchen_adapted_summary = summary;
      if (original) next.kitchen_original = original;
    } else if (original) {
      next.kitchen_original = original;
    }
    current.current = next;
    setRecipe(next);
  }, []);
  const showTranslation = translated && recipe.source_language !== 'es';
  return (
    <RecipeView
      recipe={recipe}
      recipeId={recipe.id}
      onContentChange={onContentChange}
      localizedContent={showTranslation ? spanish : null}
      localizedLanguage={showTranslation ? 'es' : null}
    />
  );
}

async function open(options: { recipe?: Recipe; translated?: boolean } = {}) {
  await render(<Screen recipe={options.recipe ?? english} translated={options.translated ?? true} />);
  await act(async () => {});
}

const doing = (action: () => void) => act(async () => action());

async function swapCream() {
  await doing(() => h.seen.RecipeIngredientList.onSwap(1));
  await doing(() => h.seen.SubstitutionModal.onApply(oatCream, stepsWithOatCream));
}

const remix = () => doing(() => h.seen.RecipeVariantModal.onApply(veganRemix, 'vegan'));

const revert = () =>
  doing(() => (h.seen.RecipeMoreMenu.items as Props[]).find((item) => item.key === 'revert')!.onPress());

/** The ingredients the cook sees after the change. */
const shownIngredients = () => (h.seen.RecipeIngredientList.rows as Props[]).map((row) => row.name);

beforeEach(() => {
  saved = [];
  h.kitchen.dislikes = [];
  for (const key of Object.keys(h.seen)) delete h.seen[key];
  for (const key of Object.keys(h.buttons)) delete h.buttons[key];
});

describe('RecipeView: a change made on a translation (PIN-187)', () => {
  it('a swap saves the translated text with the translation’s language', async () => {
    await open();
    await swapCream();

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      title: 'Pasta cremosa con tomate',
      ingredients: [spanish.ingredients[0], oatCream],
      instructions: stepsWithOatCream,
      source_language: 'es',
    });
    expect(shownIngredients()).toEqual(['pasta', 'crema de avena']);
  });

  it('a swap on the recipe’s own text leaves its language alone', async () => {
    await open({ translated: false });
    await doing(() => h.seen.RecipeIngredientList.onSwap(1));
    await doing(() => h.seen.SubstitutionModal.onApply({ name: 'oat cream', quantity: 100, unit: 'ml' }, english.instructions));

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ title: 'Creamy tomato pasta' });
    expect(saved[0]).not.toHaveProperty('source_language');
  });

  it('a remix keeps the translated title with the new steps, in the translation’s language', async () => {
    await open();
    await remix();

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      title: 'Pasta cremosa con tomate',
      ingredients: veganRemix.ingredients,
      instructions: veganRemix.instructions,
      source_language: 'es',
      kitchen_original: null,
    });
  });

  it('a remix of the recipe’s own text leaves its language alone', async () => {
    await open({ translated: false });
    await remix();

    expect(saved[0]).toMatchObject({ title: 'Creamy tomato pasta', kitchen_original: null });
    expect(saved[0]).not.toHaveProperty('source_language');
  });

  it('“Make it without these” keeps the translation as the text to go back to, not an earlier English one', async () => {
    h.kitchen.dislikes = ['nata'];
    const adapted = {
      ...english,
      kitchen_adapted_summary: 'No nuts.',
      kitchen_original: { ...english, title: 'Creamy tomato pasta with walnuts' },
    } as unknown as Recipe;
    await open({ recipe: adapted });
    await doing(() => h.buttons['recipe.avoid.make_without']());
    await remix();

    expect(saved[0]).toMatchObject({ title: 'Pasta cremosa con tomate', source_language: 'es' });
    expect(saved[0].kitchen_original).toMatchObject({
      title: 'Pasta cremosa con tomate',
      ingredients: spanish.ingredients,
      instructions: spanish.instructions,
    });

    await revert();
    expect(saved[1]).toMatchObject({ title: 'Pasta cremosa con tomate', instructions: spanish.instructions, source_language: 'es' });
  });

  it('“Make it without these” on the recipe’s own text still keeps an earlier original', async () => {
    h.kitchen.dislikes = ['cream'];
    const original = { ...english, title: 'Creamy tomato pasta with walnuts' };
    const adapted = { ...english, kitchen_adapted_summary: 'No nuts.', kitchen_original: original } as unknown as Recipe;
    await open({ recipe: adapted, translated: false });
    await doing(() => h.buttons['recipe.avoid.make_without']());
    await remix();

    expect(saved[0].kitchen_original).toMatchObject({ title: 'Creamy tomato pasta with walnuts' });
    expect(saved[0]).not.toHaveProperty('source_language');
  });

  it('“Revert to original” gives the recipe back its own language after a swap made it Spanish', async () => {
    await open();
    await swapCream();
    // The recipe is Spanish now, so nothing is translated any more: this remix is of the recipe's own text.
    await remix();
    expect(saved[1]).not.toHaveProperty('source_language');

    await revert();
    expect(saved[2]).toMatchObject({
      title: 'Creamy tomato pasta',
      ingredients: english.ingredients,
      instructions: english.instructions,
      source_language: 'en',
      kitchen_original: null,
    });
    // English again, so the screen is back to showing its Spanish translation over it.
    expect(shownIngredients()).toEqual(['pasta', 'nata']);
  });
});

describe('RecipeView: the kept original’s language (PIN-188)', () => {
  const englishOriginal = { ...english, title: 'Creamy tomato pasta with walnuts' };
  const adapted = {
    ...english,
    kitchen_adapted_summary: 'No nuts.',
    kitchen_original: englishOriginal,
  } as unknown as Recipe;

  it('a swap on a translation writes the old language into a kept original that has none', async () => {
    await open({ recipe: adapted });
    await swapCream();

    expect(saved[0]).toMatchObject({ source_language: 'es' });
    expect(saved[0].kitchen_original).toMatchObject({ title: 'Creamy tomato pasta with walnuts', language: 'en' });
  });

  it('“Revert to original” after reopening saves the original’s language, not the swap’s', async () => {
    // What the swap above left in the database: Spanish text, the English original kept with its language.
    const reopened = {
      ...adapted,
      title: 'Pasta cremosa con tomate',
      ingredients: [spanish.ingredients[0], oatCream],
      instructions: stepsWithOatCream,
      source_language: 'es',
      kitchen_original: { ...englishOriginal, language: 'en' },
    } as unknown as Recipe;
    await open({ recipe: reopened });
    await revert();

    expect(saved[0]).toMatchObject({
      title: 'Creamy tomato pasta with walnuts',
      ingredients: english.ingredients,
      source_language: 'en',
      kitchen_original: null,
    });
  });

  it('“Make it without these” on a translation keeps the translation with its language', async () => {
    h.kitchen.dislikes = ['nata'];
    await open({ recipe: adapted });
    await doing(() => h.buttons['recipe.avoid.make_without']());
    await remix();

    expect(saved[0].kitchen_original).toMatchObject({ title: 'Pasta cremosa con tomate', language: 'es' });
  });
});

describe('RecipeView: adding to the shopping list', () => {
  it('a Metric cook in Spoons mode gets ounces as grams on the list, as the list sheet shows them', async () => {
    await open({ translated: false });
    const cheddar = { name: 'cheddar', quantity: 8, unit: 'oz', metric: { quantity: 227, unit: 'g' }, spoons: { quantity: 8, unit: 'oz' } };
    await doing(() => h.seen.AddToShoppingListModal.onConfirm([cheddar]));

    expect(h.addFromRecipe).toHaveBeenCalledWith([expect.objectContaining({ name: 'cheddar', quantity: 227, unit: 'g' })], 'r1');
  });
});
