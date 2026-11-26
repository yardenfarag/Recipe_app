/**
 * The per-serving nutrition panel on the recipe, with the real English and Hebrew strings.
 * React Native Testing Library v14: render is async, always await it.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { RecipeNutritionPanel } from '@/components/recipe/RecipeNutritionPanel';
import { changeAppLanguage, initI18n } from '@/i18n/config';
import { getThemePackColors } from '@shared/constants/themes';

const language = vi.hoisted(() => ({ current: 'en' }));

vi.mock('@/hooks/useThemePreference', () => ({
  useThemePreference: () => ({ colors: getThemePackColors('mist', 'light'), packId: 'mist' }),
}));
vi.mock('@/hooks/useLanguagePreference', () => ({ useLanguagePreference: () => ({ language: language.current }) }));
// The kit's tiles import expo-image and expo-linear-gradient, which need native modules.
vi.mock('expo-image', async () => {
  const { View } = await import('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
vi.mock('expo-linear-gradient', async () => {
  const { View } = await import('react-native');
  return { LinearGradient: (props: object) => <View {...props} /> };
});

// @expo/vector-icons ships untranspiled JSX in .js, which Vitest can't parse; icons aren't under test.
vi.mock('@expo/vector-icons/Ionicons', async () => {
  const { Text } = await import('react-native');
  return { default: () => <Text /> };
});
vi.mock('@expo/vector-icons/MaterialCommunityIcons', async () => {
  const { Text } = await import('react-native');
  return { default: () => <Text /> };
});

const nutrition = { protein_g: 30, carbs_g: 40, fat_g: 18 };

beforeAll(() => {
  initI18n('en');
});

afterEach(async () => {
  language.current = 'en';
  await changeAppLanguage('en');
});

describe('RecipeNutritionPanel', () => {
  it('shows calories, protein, carbs and fat for one serving, read out as one sentence', async () => {
    await render(<RecipeNutritionPanel calories={450} nutrition={nutrition} />);
    for (const text of ['Per serving', 'Calories', '450', 'Protein', '30 g', 'Carbs', '40 g', 'Fat', '18 g']) {
      expect(screen.getByText(text, { includeHiddenElements: true })).toBeTruthy();
    }
    expect(screen.getByTestId('recipe-nutrition').props.accessibilityLabel).toBe(
      'Per serving: Calories 450, Protein 30 g, Carbs 40 g, Fat 18 g',
    );
  });

  it("draws each macro's share of the calories (4/4/9 a gram) under it", async () => {
    await render(<RecipeNutritionPanel calories={450} nutrition={nutrition} />);
    // 30 g protein = 120, 40 g carbs = 160, 18 g fat = 162, of 442.
    const widths = screen
      .getAllByTestId('macro-meter', { includeHiddenElements: true })
      .map((meter) => {
        const fill = meter.children[0];
        return typeof fill === 'string' ? fill : StyleSheet.flatten(fill.props.style).width;
      });
    expect(widths).toEqual(['27%', '36%', '37%']);
  });

  it('is in Hebrew in the Hebrew app', async () => {
    language.current = 'he';
    await changeAppLanguage('he');
    await render(<RecipeNutritionPanel calories={450} nutrition={nutrition} />);
    expect(screen.getByTestId('recipe-nutrition').props.accessibilityLabel).toBe(
      'למנה: קלוריות 450, חלבון 30 ג׳, פחמימות 40 ג׳, שומן 18 ג׳',
    );
  });
});
