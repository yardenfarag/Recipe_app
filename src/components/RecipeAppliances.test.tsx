/**
 * "What you'll need" (ADR 017) rendered with the real English and Hebrew strings, in LTR and RTL.
 * React Native Testing Library v14: render and fireEvent are async, always await them.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { RecipeAppliances } from '@/components/RecipeAppliances';
import { getThemePackColors } from '@shared/constants/themes';
import { changeAppLanguage, initI18n } from '@/i18n/config';
import type { RecipeAppliance } from '@shared/lib/appliances';

const rtlState = vi.hoisted(() => ({ rtl: false }));

vi.mock('@/hooks/useThemePreference', () => ({
  useThemePreference: () => ({ colors: getThemePackColors('mist', 'light'), packId: 'mist' }),
}));
// The kit's Text (in SheetModal) reads the app language for its fonts.
vi.mock('@/hooks/useLanguagePreference', () => ({ useLanguagePreference: () => ({ language: 'en' }) }));
// The kit's tiles import expo-image and expo-linear-gradient, which need native modules.
vi.mock('expo-image', async () => {
  const { View } = await import('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
vi.mock('expo-linear-gradient', async () => {
  const { View } = await import('react-native');
  return { LinearGradient: (props: object) => <View {...props} /> };
});

vi.mock('@/hooks/useRtl', () => ({
  useRtl: () => ({
    rtl: rtlState.rtl,
    writingDirection: rtlState.rtl ? 'rtl' : 'ltr',
    textAlign: rtlState.rtl ? 'right' : 'left',
    chevronForward: rtlState.rtl ? 'chevron-back' : 'chevron-forward',
    chevronBack: rtlState.rtl ? 'chevron-forward' : 'chevron-back',
  }),
}));

// @expo/vector-icons ships untranspiled JSX in .js, which Vitest can't parse; icons aren't under test.
vi.mock('@expo/vector-icons/Ionicons', async () => {
  const { Text } = await import('react-native');
  return { default: ({ name }: { name: string }) => <Text testID={`icon-${name}`} /> };
});
vi.mock('@expo/vector-icons/MaterialCommunityIcons', async () => {
  const { Text } = await import('react-native');
  return { default: ({ name }: { name: string }) => <Text testID={`icon-${name}`} /> };
});

vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const STEPS_EN = [
  { step: 1, text: 'Heat the oven to 180°C.' },
  { step: 2, text: 'Grind the cumin in a mortar.' },
  { step: 3, text: 'Bake for 35 minutes.' },
];
const STEPS_HE = [
  { step: 1, text: 'מחממים תנור ל-180 מעלות.' },
  { step: 2, text: 'כותשים כמון במכתש.' },
  { step: 3, text: 'אופים 35 דקות.' },
];

const OVEN: RecipeAppliance = { key: 'oven', required: true, steps: [1, 3], origin: 'source' };
const AIR_FRYER: RecipeAppliance = { key: 'air_fryer', required: true, steps: [3], origin: 'source' };
const MORTAR: RecipeAppliance = {
  key: 'mortar_and_pestle',
  required: false,
  benefit: 'richer_flavor',
  alternative: 'pre_ground',
  steps: [2],
  origin: 'source',
};
const THERMOMETER_TIP: RecipeAppliance = {
  key: 'kitchen_thermometer',
  required: false,
  benefit: 'juicier_meat',
  alternative: 'cut_to_check',
  steps: [3],
  origin: 'tip',
};
const ALL = [OVEN, AIR_FRYER, MORTAR, THERMOMETER_TIP];

function flat(style: unknown) {
  return StyleSheet.flatten(style as never) as { writingDirection?: string; textAlign?: string };
}

/**
 * The kit's Text at the reading start in Hebrew on the phone: React Native mirrors 'left' in a right-to-left
 * layout, so the text pins its direction to rtl and asks for 'left', which lands on the right (textDirectionStyle).
 */
const HEBREW_START = { writingDirection: 'rtl', direction: 'rtl', textAlign: 'left' };

async function inLanguage(language: 'en' | 'he') {
  rtlState.rtl = language === 'he';
  await changeAppLanguage(language);
}

beforeAll(() => {
  initI18n('en');
});

afterEach(async () => {
  await inLanguage('en');
});

describe('RecipeAppliances: states', () => {
  it('shows nothing at all for a recipe that was not analysed', async () => {
    await render(<RecipeAppliances appliances={null} instructions={STEPS_EN} />);
    expect(screen.queryByTestId('recipe-appliances')).toBeNull();
  });

  it('says no special equipment is needed for an empty list, in English and Hebrew', async () => {
    await render(<RecipeAppliances appliances={[]} instructions={STEPS_EN} />);
    expect(screen.getByText("What you'll need")).toBeTruthy();
    expect(screen.getByText('No special equipment needed')).toBeTruthy();
    expect(screen.queryByTestId('appliances-required')).toBeNull();

    await inLanguage('he');
    await render(<RecipeAppliances appliances={[]} instructions={STEPS_HE} />);
    expect(screen.getByText('מה צריך')).toBeTruthy();
    expect(screen.getByText('לא צריך ציוד מיוחד')).toBeTruthy();
  });
});

describe('RecipeAppliances: recalculating after a hand edit (ADR 018)', () => {
  it('keeps showing the current list with "Updating…" until the new one arrives', async () => {
    await render(<RecipeAppliances appliances={[OVEN]} instructions={STEPS_EN} updating />);
    expect(screen.getByText('Oven')).toBeTruthy();
    expect(screen.getByText('Updating…')).toBeTruthy();
  });

  it('shows the section with "Updating…" for a written recipe that has no list yet', async () => {
    await render(<RecipeAppliances appliances={null} instructions={STEPS_EN} updating />);
    expect(screen.getByText("What you'll need")).toBeTruthy();
    expect(screen.getByText('Updating…')).toBeTruthy();
    expect(screen.queryByTestId('appliances-none')).toBeNull();
  });

  it('says "Updating…" in Hebrew, right to left', async () => {
    await inLanguage('he');
    await render(<RecipeAppliances appliances={[OVEN]} instructions={STEPS_HE} updating />);
    const note = screen.getByText('מתעדכן…');
    expect(flat(note.props.style)).toMatchObject(HEBREW_START);
  });

  it('shows no "Updating…" when nothing is recalculating', async () => {
    await render(<RecipeAppliances appliances={[OVEN]} instructions={STEPS_EN} />);
    expect(screen.queryByTestId('appliances-updating')).toBeNull();
  });
});

describe('RecipeAppliances: English, left to right', () => {
  it('groups required and "Makes it better" items with benefits, workarounds and the tip label', async () => {
    await render(<RecipeAppliances appliances={ALL} instructions={STEPS_EN} />);
    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.getByText('Makes it better')).toBeTruthy();
    expect(screen.getByText('Oven')).toBeTruthy();
    expect(screen.getByText('Air fryer')).toBeTruthy();
    expect(screen.getByText('Mortar & pestle')).toBeTruthy();
    expect(screen.getByText('Richer flavor · or ground spices')).toBeTruthy();
    expect(screen.getByText('Juicier, not overcooked · or cut to check')).toBeTruthy();
    expect(screen.getByTestId('appliance-tip-kitchen_thermometer')).toBeTruthy();
    expect(screen.getByText('Pinch tip')).toBeTruthy();
    expect(screen.queryByTestId('appliance-tip-mortar_and_pestle')).toBeNull();
  });

  it('gives every chip a full spoken label and a hint', async () => {
    await render(<RecipeAppliances appliances={ALL} instructions={STEPS_EN} />);
    expect(screen.getByTestId('appliance-chip-oven').props.accessibilityLabel).toBe('Oven, Required');
    expect(screen.getByTestId('appliance-chip-mortar_and_pestle').props.accessibilityLabel).toBe(
      'Mortar & pestle, Optional, Richer flavor · or ground spices',
    );
    expect(screen.getByTestId('appliance-chip-kitchen_thermometer').props.accessibilityLabel).toMatch(/^Kitchen thermometer, Pinch tip,/);
    expect(screen.getByTestId('appliance-chip-oven').props.accessibilityHint).toBe('Shows the steps that use it');
  });

  it('opens a sheet with the steps that use the appliance', async () => {
    await render(<RecipeAppliances appliances={ALL} instructions={STEPS_EN} />);
    await fireEvent.press(screen.getByTestId('appliance-chip-oven'));
    expect(screen.getByTestId('appliance-sheet')).toBeTruthy();
    expect(screen.getByText('Used in steps 1, 3')).toBeTruthy();
    expect(screen.getByText('1. Heat the oven to 180°C.')).toBeTruthy();
    expect(screen.getByText('3. Bake for 35 minutes.')).toBeTruthy();
  });

  it('explains a Pinch tip in its sheet', async () => {
    await render(<RecipeAppliances appliances={ALL} instructions={STEPS_EN} />);
    await fireEvent.press(screen.getByTestId('appliance-chip-kitchen_thermometer'));
    expect(screen.getByText("Suggested by Pinch. The recipe doesn't mention it, but it helps here.")).toBeTruthy();
    expect(screen.getByText('Used in step 3')).toBeTruthy();
  });

  it('lays text out left to right', async () => {
    await render(<RecipeAppliances appliances={ALL} instructions={STEPS_EN} />);
    expect(flat(screen.getByText("What you'll need").props.style)).toMatchObject({ writingDirection: 'ltr', textAlign: 'left' });
    expect(flat(screen.getByText('Richer flavor · or ground spices').props.style)).toMatchObject({ writingDirection: 'ltr' });
  });
});

describe('RecipeAppliances: Hebrew, right to left', () => {
  it('shows every label in Hebrew', async () => {
    await inLanguage('he');
    await render(<RecipeAppliances appliances={ALL} instructions={STEPS_HE} />);
    expect(screen.getByText('מה צריך')).toBeTruthy();
    expect(screen.getByText('חובה')).toBeTruthy();
    expect(screen.getByText('משפר את התוצאה')).toBeTruthy();
    expect(screen.getByText('תנור')).toBeTruthy();
    expect(screen.getByText('אייר פרייר')).toBeTruthy();
    expect(screen.getByText('מכתש ועלי')).toBeTruthy();
    expect(screen.getByText('טעם עשיר יותר · או תבלינים טחונים')).toBeTruthy();
    expect(screen.getByText('טיפ של Pinch')).toBeTruthy();
    expect(screen.getByTestId('appliance-chip-oven').props.accessibilityLabel).toBe('תנור, חובה');
  });

  it('lays text out right to left', async () => {
    await inLanguage('he');
    await render(<RecipeAppliances appliances={ALL} instructions={STEPS_HE} />);
    expect(flat(screen.getByText('מה צריך').props.style)).toMatchObject(HEBREW_START);
    expect(flat(screen.getByText('טעם עשיר יותר · או תבלינים טחונים').props.style)).toMatchObject({ writingDirection: 'rtl' });
  });

  it('shows the Hebrew steps in the sheet', async () => {
    await inLanguage('he');
    await render(<RecipeAppliances appliances={ALL} instructions={STEPS_HE} />);
    await fireEvent.press(screen.getByTestId('appliance-chip-mortar_and_pestle'));
    expect(screen.getByText('בשימוש בשלב 2')).toBeTruthy();
    expect(screen.getByText('2. כותשים כמון במכתש.')).toBeTruthy();
  });
});

describe('RecipeAppliances: recipe direction differs from the app', () => {
  it('shows a Hebrew recipe right to left inside the English app, labels stay left to right', async () => {
    await render(<RecipeAppliances appliances={ALL} instructions={STEPS_HE} stepDirection="rtl" />);
    await fireEvent.press(screen.getByTestId('appliance-chip-oven'));
    expect(flat(screen.getByTestId('appliance-step-1').props.style)).toMatchObject({ writingDirection: 'rtl', textAlign: 'right' });
    expect(flat(screen.getByText('Used in steps 1, 3').props.style)).toMatchObject({ writingDirection: 'ltr' });
  });

  it('shows an English recipe left to right inside the Hebrew app', async () => {
    await inLanguage('he');
    await render(<RecipeAppliances appliances={ALL} instructions={STEPS_EN} stepDirection="ltr" />);
    await fireEvent.press(screen.getByTestId('appliance-chip-oven'));
    expect(flat(screen.getByTestId('appliance-step-1').props.style)).toMatchObject({ writingDirection: 'ltr', textAlign: 'left' });
    expect(flat(screen.getByText('בשימוש בשלבים 1, 3').props.style)).toMatchObject({ writingDirection: 'rtl' });
  });
});

describe('RecipeAppliances: My appliances (PIN-155)', () => {
  const kitchen = { owned: ['oven' as const], notOwned: ['air_fryer' as const, 'mortar_and_pestle' as const] };

  it('marks nothing before the reader saves a list', async () => {
    await render(<RecipeAppliances appliances={ALL} instructions={STEPS_EN} />);
    // The kit draws icons hidden from screen readers (the chip's label says it), so look among hidden elements too.
    expect(screen.queryByTestId('icon-checkmark', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('icon-alert-circle', { includeHiddenElements: true })).toBeNull();
  });

  it('ticks what the kitchen has and flags a required appliance it lacks', async () => {
    await render(<RecipeAppliances appliances={ALL} instructions={STEPS_EN} kitchen={kitchen} />);
    expect(screen.getAllByTestId('icon-checkmark', { includeHiddenElements: true })).toHaveLength(1);
    // The air fryer is required and missing; the mortar is optional, so it is not flagged.
    expect(screen.getAllByTestId('icon-alert-circle', { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.getByTestId('appliance-chip-air_fryer').props.accessibilityLabel).toMatch(/Not in your kitchen|myAppliances.notInKitchen/);
  });
});
