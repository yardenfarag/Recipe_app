/**
 * Cook mode's read aloud, with expo-speech replaced by a recorder. React Native Testing Library v14: render and
 * fireEvent are async, always await them.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getThemePackColors } from '@shared/constants/themes';
import { initI18n } from '@/i18n/config';
import type { Instruction } from '@shared/types/recipe';

import { CookMode } from './CookMode';

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  spoken: [] as { text: string; options: { language?: string; voice?: string; onDone?: () => void } }[],
  voices: [] as { identifier: string; name: string; quality: string; language: string }[],
  stop: vi.fn(async () => undefined),
  appState: [] as ((state: AppStateStatus) => void)[],
  haptics: { step: vi.fn(), timerDone: vi.fn() },
}));

vi.mock('@/lib/haptics', () => ({ haptics: mocks.haptics }));

vi.mock('expo-speech', () => ({
  VoiceQuality: { Default: 'Default', Enhanced: 'Enhanced' },
  speak: (text: string, options: { onDone?: () => void }) => mocks.spoken.push({ text, options }),
  stop: mocks.stop,
  getAvailableVoicesAsync: async () => mocks.voices,
}));
vi.mock('expo-keep-awake', () => ({ useKeepAwake: () => undefined }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mocks.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => void mocks.storage.set(key, value)),
  },
}));
vi.mock('@/hooks/useThemePreference', () => ({
  useThemePreference: () => ({ colors: getThemePackColors('mist', 'light'), packId: 'mist' }),
}));
// The kit's Text reads the app language for its fonts.
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
vi.mock('@/hooks/useRtl', () => ({ useRtl: () => ({ rtl: false }) }));
vi.mock('@/lib/interactionLog', () => ({ logTap: vi.fn() }));
vi.mock('@/lib/a11y', () => ({ announce: vi.fn() }));
vi.mock('@expo/vector-icons/Ionicons', async () => {
  const { Text } = await import('react-native');
  return { default: ({ name }: { name: string }) => <Text testID={`icon-${name}`} /> };
});
vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('react-native');
  return { SafeAreaView: View };
});

const steps: Instruction[] = [
  { step: 1, text: 'Heat the oven to 180 °C.' },
  { step: 2, text: 'Bake for 20 minutes.' },
];

const texts = () => mocks.spoken.map((item) => item.text);
const speaker = (name = 'Read steps aloud') => screen.getByRole('switch', { name });

async function renderCookMode(props: Partial<Parameters<typeof CookMode>[0]> = {}) {
  const view = await render(
    <CookMode visible title="Bread" instructions={steps} onClose={vi.fn()} contentLanguage="en" {...props} />,
  );
  // Let the voice list and the saved setting load.
  await act(async () => {});
  return view;
}

beforeAll(() => {
  initI18n('en');
});

beforeEach(() => {
  mocks.storage.clear();
  mocks.spoken.length = 0;
  mocks.stop.mockClear();
  mocks.voices = [
    { identifier: 'samantha', name: 'Samantha', quality: 'Default', language: 'en-US' },
    { identifier: 'ava', name: 'Ava', quality: 'Enhanced', language: 'en-US' },
    { identifier: 'carmit', name: 'Carmit', quality: 'Default', language: 'he-IL' },
  ];
  mocks.appState.length = 0;
  mocks.haptics.step.mockClear();
  mocks.haptics.timerDone.mockClear();
  vi.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    mocks.appState.push(listener as (state: AppStateStatus) => void);
    return { remove: vi.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CookMode read aloud', () => {
  it('is off until turned on, then reads the step as shown in the best voice', async () => {
    await renderCookMode();
    expect(mocks.spoken).toHaveLength(0);

    await fireEvent.press(speaker());
    expect(texts()).toEqual(['Step 1 of 2.']);
    expect(mocks.spoken[0]?.options).toMatchObject({ language: 'en-US', voice: 'ava' });
    expect(mocks.storage.get('pinch:cookReadAloud')).toBe('on');

    await act(async () => mocks.spoken[0]?.options.onDone?.());
    expect(texts()).toEqual(['Step 1 of 2.', 'Heat the oven to 180 °C.']);
  });

  it('reads each new step, and again on request', async () => {
    mocks.storage.set('pinch:cookReadAloud', 'on');
    await renderCookMode();
    expect(texts()).toEqual(['Step 1 of 2.']);

    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(mocks.stop).toHaveBeenCalled();
    expect(texts().at(-1)).toBe('Step 2 of 2.');

    await fireEvent.press(screen.getByRole('button', { name: 'Read again' }));
    expect(texts().slice(-2)).toEqual(['Step 2 of 2.', 'Step 2 of 2.']);
  });

  it('stops when turned off, and when the app goes to the background', async () => {
    mocks.storage.set('pinch:cookReadAloud', 'on');
    await renderCookMode();
    await fireEvent.press(speaker());
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.storage.get('pinch:cookReadAloud')).toBe('off');
    expect(screen.queryByRole('button', { name: 'Read again' })).toBeNull();

    await fireEvent.press(speaker());
    mocks.stop.mockClear();
    await act(async () => mocks.appState.forEach((listener) => listener('background')));
    expect(mocks.stop).toHaveBeenCalled();
  });

  it('stops when cook mode closes', async () => {
    mocks.storage.set('pinch:cookReadAloud', 'on');
    const view = await renderCookMode();
    mocks.stop.mockClear();
    await view.unmount();
    expect(mocks.stop).toHaveBeenCalled();
  });

  it('reads a Hebrew recipe in a Hebrew voice, without the English step label', async () => {
    mocks.storage.set('pinch:cookReadAloud', 'on');
    await renderCookMode({ contentLanguage: 'he', instructions: [{ step: 1, text: 'לחמם תנור ל־180 °C.' }] });
    expect(texts()).toEqual(['לחמם תנור ל־180 °C.']);
    expect(mocks.spoken[0]?.options).toMatchObject({ language: 'he-IL', voice: 'carmit' });
  });

  it('is greyed out when the phone has no voice for the language, and says why when tapped', async () => {
    mocks.storage.set('pinch:cookReadAloud', 'on');
    await renderCookMode({ contentLanguage: 'ru' });
    expect(mocks.spoken).toHaveLength(0);
    const button = speaker('No Russian voice on this device');
    await fireEvent.press(button);
    expect(mocks.spoken).toHaveLength(0);
    expect(screen.getByText('No Russian voice on this device')).toBeTruthy();
  });

  it('still tries, by language, when the phone lists no voices', async () => {
    mocks.voices = [];
    mocks.storage.set('pinch:cookReadAloud', 'on');
    await renderCookMode({ contentLanguage: 'es', instructions: [{ step: 1, text: 'Hornear.' }] });
    expect(mocks.spoken[0]).toMatchObject({ text: 'Hornear.', options: { language: 'es-ES', voice: undefined } });
  });
});

describe('CookMode haptics', () => {
  it('taps when the step changes, not at either end', async () => {
    await renderCookMode();
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(mocks.haptics.step).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mocks.haptics.step).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mocks.haptics.step).toHaveBeenCalledTimes(2);
  });

  it('buzzes once when a timer finishes', async () => {
    await renderCookMode({ instructions: [{ step: 1, text: 'Rest for 1 minute.' }] });
    vi.useFakeTimers();
    try {
      await fireEvent.press(screen.getByRole('button', { name: /timer/i }));
      await act(async () => {
        vi.advanceTimersByTime(61_000);
      });
      expect(mocks.haptics.timerDone).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
