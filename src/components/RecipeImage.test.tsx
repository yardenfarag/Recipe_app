/**
 * The "AI image" mark on a picture Pinch drew. React Native Testing Library v14: render is async.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { RecipeImage } from '@/components/RecipeImage';
import { getThemePackColors } from '@shared/constants/themes';
import { initI18n } from '@/i18n/config';

vi.mock('@/hooks/useThemePreference', () => ({
  useThemePreference: () => ({ colors: getThemePackColors('mist', 'light'), packId: 'mist' }),
}));

// The kit's tokens read the reading direction, which would pull in the Supabase client.
vi.mock('@/hooks/useRtl', () => ({ useRtl: () => ({ rtl: false }) }));

// @expo/vector-icons ships untranspiled JSX in .js, which Vitest can't parse; icons aren't under test.
vi.mock('@expo/vector-icons/Ionicons', async () => {
  const { Text } = await import('react-native');
  return { default: ({ name }: { name: string }) => <Text testID={`icon-${name}`} /> };
});

vi.mock('expo-image', async () => {
  const { View } = await import('react-native');
  return { Image: (props: { style: unknown }) => <View testID="photo" style={props.style as never} /> };
});

beforeAll(async () => {
  await initI18n();
});

const scaleOf = () => {
  // A photo is decorative (hidden from screen readers), so the query has to look past that.
  const photo = screen.getByTestId('photo', { includeHiddenElements: true });
  const style = StyleSheet.flatten(photo.props.style) as { transform?: Record<string, number>[] };
  return style.transform?.find((entry) => 'scaleX' in entry)?.scaleX;
};

describe('RecipeImage', () => {
  it('marks a drawn picture, says so to screen readers, and shows it whole', async () => {
    await render(<RecipeImage uri="https://example.com/ai/soup.jpg" aiGenerated />);
    expect(screen.getByTestId('ai-image-mark')).toBeTruthy();
    expect(screen.getByLabelText('AI image')).toBeTruthy();
    expect(scaleOf()).toBe(1);
  });

  it('adds the mark to a label the picture already has', async () => {
    await render(<RecipeImage uri="https://example.com/ai/soup.jpg" aiGenerated accessibilityLabel="Leek soup" />);
    expect(screen.getByLabelText('Leek soup, AI image')).toBeTruthy();
  });

  it('leaves a photo unmarked, decorative and zoomed past video bars', async () => {
    await render(<RecipeImage uri="https://example.com/soup.jpg" />);
    expect(screen.queryByTestId('ai-image-mark', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByLabelText('AI image')).toBeNull();
    expect(scaleOf()).toBe(2);
  });
});
