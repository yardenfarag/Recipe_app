/**
 * The presenters rendered with the real English strings. React Native Testing
 * Library v14: render and fireEvent are async, always await them.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { getThemePackColors } from '@/constants/themes';
import { initI18n } from '@/i18n/config';
import type { InAppMessage } from '@/lib/inAppMessages';

import { AlertPresenter } from './AlertPresenter';
import { BannerPresenter } from './BannerPresenter';
import { FullscreenPresenter } from './FullscreenPresenter';
import { buildMessageView } from './viewModel';

vi.mock('@/hooks/useThemePreference', () => ({
  useThemePreference: () => ({ colors: getThemePackColors('mist', 'light') }),
}));
vi.mock('@/hooks/useRtl', () => ({
  useRtl: () => ({ rtl: false, writingDirection: 'ltr', textAlign: 'left' }),
}));
vi.mock('@/lib/interactionLog', () => ({ logTap: vi.fn() }));
vi.mock('@expo/vector-icons/Ionicons', async () => {
  const { Text } = await import('react-native');
  const Icon = ({ name }: { name: string }) => <Text testID={`icon-${name}`} />;
  Icon.glyphMap = { sparkles: 1, 'information-circle': 2, 'alert-circle': 3 };
  return { default: Icon };
});
vi.mock('expo-image', async () => {
  const { View } = await import('react-native');
  return { Image: (props: object) => <View testID="message-image" {...props} /> };
});
vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const LABELS = { update: 'Update', learnMore: 'Learn more', close: 'Close' };

function message(extra: Partial<InAppMessage> = {}): InAppMessage {
  return {
    id: 'm1',
    presentation: 'fullscreen',
    tone: 'info',
    content: {
      en: { title: 'Hello', body: 'World', primaryLabel: 'Open', secondaryLabel: 'Later' },
      he: { title: 'שלום', body: 'עולם', primaryLabel: 'פתיחה', secondaryLabel: 'אחר כך' },
    },
    primaryAction: { type: 'route', href: '/hub' },
    secondaryAction: { type: 'dismiss' },
    dismissible: true,
    required: false,
    frequency: { type: 'once' },
    priority: 0,
    ...extra,
  };
}

beforeAll(() => {
  initI18n('en');
});

/** Android back and the web Escape key reach the Modal's onRequestClose (the root host element here). */
function requestClose() {
  const modal = screen.root as unknown as { props: { onRequestClose?: () => void } };
  expect(modal.props.onRequestClose).toBeTypeOf('function');
  modal.props.onRequestClose?.();
}

describe('FullscreenPresenter', () => {
  it('shows a close button on a dismissible message, and the buttons call back', async () => {
    const onClose = vi.fn();
    const onAction = vi.fn();
    const view = buildMessageView(message(), 'en', LABELS);
    await render(<FullscreenPresenter view={view} onAction={onAction} onClose={onClose} />);

    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText('Open'));
    expect(onAction).toHaveBeenCalledWith('primary', { type: 'route', href: '/hub' });
  });

  it('a required message has no close button, no dismiss button, offers Update, and ignores back', async () => {
    const onClose = vi.fn();
    const onAction = vi.fn();
    const view = buildMessageView(message({ required: true, dismissible: false }), 'en', LABELS);
    await render(<FullscreenPresenter view={view} onAction={onAction} onClose={onClose} />);

    expect(screen.queryByLabelText('Close')).toBeNull();
    expect(screen.queryByLabelText('Later')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Update'));
    expect(onAction).toHaveBeenCalledWith('primary', { type: 'store' });

    // Android back / Escape on web reaches onRequestClose; it must not close.
    requestClose();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes a dismissible message on back', async () => {
    const onClose = vi.fn();
    const view = buildMessageView(message(), 'en', LABELS);
    await render(<FullscreenPresenter view={view} onAction={vi.fn()} onClose={onClose} />);
    requestClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lays Hebrew content out right-to-left', async () => {
    const view = buildMessageView(message(), 'he', LABELS);
    await render(<FullscreenPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('שלום').props.style).toMatchObject({ writingDirection: 'rtl', textAlign: 'center' });
  });

  it('shows the image when the message has one', async () => {
    const view = buildMessageView(message({ imageUrl: 'https://example.com/a.png' }), 'en', LABELS);
    await render(<FullscreenPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('message-image').props.source).toEqual({ uri: 'https://example.com/a.png' });
  });
});

describe('AlertPresenter card', () => {
  // In the test runtime the device is left-to-right, so a Hebrew alert uses the card, never the system alert.
  it('uses the card for a Hebrew alert and a tap on the backdrop closes it', async () => {
    const onClose = vi.fn();
    const view = buildMessageView(message({ presentation: 'alert' }), 'he', LABELS);
    await render(<AlertPresenter view={view} onAction={vi.fn()} onClose={onClose} />);
    expect(screen.getByText('שלום').props.style).toMatchObject({ writingDirection: 'rtl' });
    await fireEvent.press(screen.getAllByLabelText('Close')[0] as never);
    expect(onClose).toHaveBeenCalled();
  });

  it('a message that cannot be dismissed has no backdrop or close control', async () => {
    const view = buildMessageView(message({ presentation: 'alert', dismissible: false }), 'he', LABELS);
    await render(<AlertPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('Close')).toBeNull();
  });
});

describe('BannerPresenter', () => {
  it('shows title, body and buttons, and closes when dismissible', async () => {
    const onClose = vi.fn();
    const onAction = vi.fn();
    const view = buildMessageView(message({ presentation: 'banner' }), 'en', LABELS);
    await render(<BannerPresenter view={view} onAction={onAction} onClose={onClose} edge="top" />);
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('World')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open'));
    expect(onAction).toHaveBeenCalledWith('primary', { type: 'route', href: '/hub' });
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no close control when it cannot be dismissed', async () => {
    const view = buildMessageView(message({ presentation: 'banner', dismissible: false }), 'en', LABELS);
    await render(<BannerPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} edge="bottom" />);
    expect(screen.queryByLabelText('Close')).toBeNull();
  });
});
