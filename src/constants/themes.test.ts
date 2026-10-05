import { describe, expect, it } from 'vitest';

import { ThemePacks, type ThemePackColors } from '@/constants/themes';

function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Key = keyof ThemePackColors;

// Foreground tokens used for body-size text, and the surfaces they sit on.
// WCAG 2.1 AA asks for 4.5:1.
const pairs: [Key, Key][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text', 'backgroundElement'],
  ['text', 'backgroundSelected'],
  ['textSecondary', 'background'],
  ['textSecondary', 'surface'],
  ['textSecondary', 'backgroundElement'],
  ['textSecondary', 'backgroundSelected'],
  ['primary', 'background'],
  ['primary', 'surface'],
  ['primary', 'primarySoft'],
  ['onPrimary', 'primary'],
  // Accent fills (e.g. Guess mode) reuse onPrimary for their label.
  ['onPrimary', 'accent'],
  ['accent', 'background'],
  ['accent', 'surface'],
  ['accent', 'accentSoft'],
  ['danger', 'background'],
  ['danger', 'surface'],
  ['danger', 'dangerSoft'],
  ['warning', 'background'],
  ['warning', 'surface'],
  ['warning', 'warningSoft'],
  ['success', 'background'],
  ['success', 'surface'],
  ['success', 'successSoft'],
];

describe('theme colour contrast', () => {
  const cases = Object.values(ThemePacks).flatMap((pack) =>
    (['light', 'dark'] as const).map((mode) => [`${pack.id} ${mode}`, pack[mode]] as const),
  );

  it.each(cases)('%s meets WCAG AA for text pairs', (_name, colors) => {
    const failures = pairs
      .map(([fg, bg]) => ({ pair: `${fg} on ${bg}`, ratio: contrast(colors[fg] as string, colors[bg] as string) }))
      .filter(({ ratio }) => ratio < 4.5)
      .map(({ pair, ratio }) => `${pair}: ${ratio.toFixed(2)}`);
    expect(failures).toEqual([]);
  });
});
