/**
 * The presenters rendered with the real English strings. React Native Testing
 * Library v14: render and fireEvent are async, always await them.
 */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { getThemePackColors } from '@shared/constants/themes';
import { initI18n } from '@/i18n/config';
import type { InAppMessage } from '@shared/lib/inAppMessages';

import { AlertPresenter } from './AlertPresenter';
import { BannerPresenter } from './BannerPresenter';
import { FullscreenPresenter } from './FullscreenPresenter';
import { SheetPresenter } from './SheetPresenter';
import { MODAL_RETRY_MS, useModalShow } from './useModalShow';
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
    await render(<FullscreenPresenter view={view} onAction={onAction} onClose={onClose} onShown={vi.fn()} />);

    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText('Open'));
    expect(onAction).toHaveBeenCalledWith('primary', { type: 'route', href: '/hub' });
  });

  it('a required message has no close button, no dismiss button, offers Update, and ignores back', async () => {
    const onClose = vi.fn();
    const onAction = vi.fn();
    const view = buildMessageView(message({ required: true, dismissible: false }), 'en', LABELS);
    await render(<FullscreenPresenter view={view} onAction={onAction} onClose={onClose} onShown={vi.fn()} />);

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
    await render(<FullscreenPresenter view={view} onAction={vi.fn()} onClose={onClose} onShown={vi.fn()} />);
    requestClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lays Hebrew content out right-to-left', async () => {
    const view = buildMessageView(message(), 'he', LABELS);
    await render(<FullscreenPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} onShown={vi.fn()} />);
    expect(screen.getByText('שלום').props.style).toMatchObject({ writingDirection: 'rtl', textAlign: 'center' });
  });

  it('shows the image when the message has one', async () => {
    const view = buildMessageView(message({ imageUrl: 'https://example.com/a.png' }), 'en', LABELS);
    await render(<FullscreenPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} onShown={vi.fn()} />);
    expect(screen.getByTestId('message-image').props.source).toEqual({ uri: 'https://example.com/a.png' });
  });
});

describe('AlertPresenter card', () => {
  // In the test runtime the device is left-to-right, so a Hebrew alert uses the card, never the system alert.
  it('uses the card for a Hebrew alert and a tap on the backdrop closes it', async () => {
    const onClose = vi.fn();
    const view = buildMessageView(message({ presentation: 'alert' }), 'he', LABELS);
    await render(<AlertPresenter view={view} onAction={vi.fn()} onClose={onClose} onShown={vi.fn()} />);
    expect(screen.getByText('שלום').props.style).toMatchObject({ writingDirection: 'rtl' });
    await fireEvent.press(screen.getAllByLabelText('Close')[0] as never);
    expect(onClose).toHaveBeenCalled();
  });

  it('a message that cannot be dismissed has no backdrop or close control', async () => {
    const view = buildMessageView(message({ presentation: 'alert', dismissible: false }), 'he', LABELS);
    await render(<AlertPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} onShown={vi.fn()} />);
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

describe('a dismissible alert always has a way to close it (iOS closes an alert only through a button)', () => {
  const NO_DISMISS = { secondaryAction: undefined, presentation: 'alert' as const };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('system alert: a button that does something gets a cancel-style Close, which records the close', async () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onClose = vi.fn();
    const onShown = vi.fn();
    const view = buildMessageView(message(NO_DISMISS), 'en', LABELS);
    await render(<AlertPresenter view={view} onAction={vi.fn()} onClose={onClose} onShown={onShown} />);

    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((b) => b.text)).toEqual(['Open', 'Close']);
    expect(buttons[1]?.style).toBe('cancel');
    buttons[1]?.onPress?.();
    expect(onClose).toHaveBeenCalledTimes(1);
    // A system alert has no "shown" event: it counts as shown at the call.
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it('system alert: a "dismiss" button already closes it, so no extra button is added', async () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const view = buildMessageView(message({ presentation: 'alert' }), 'en', LABELS);
    await render(<AlertPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} onShown={vi.fn()} />);
    expect((alert.mock.calls[0]?.[2] ?? []).map((b) => b.text)).toEqual(['Open', 'Later']);
  });

  it('a button and a link that both do something would need a third place, so the card is used, with a Close button', async () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onClose = vi.fn();
    const view = buildMessageView(message({ ...NO_DISMISS, link: { url: 'https://example.com' } }), 'en', LABELS);
    await render(<AlertPresenter view={view} onAction={vi.fn()} onClose={onClose} onShown={vi.fn()} />);
    expect(alert).not.toHaveBeenCalled();
    // The card's round close control and the Close button.
    const closes = screen.getAllByLabelText('Close');
    expect(closes).toHaveLength(2);
    await fireEvent.press(closes[1] as never);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a message that cannot be dismissed gets no Close button on the card', async () => {
    const view = buildMessageView(
      message({ ...NO_DISMISS, dismissible: false, link: { url: 'https://example.com' } }),
      'en',
      LABELS,
    );
    await render(<AlertPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} onShown={vi.fn()} />);
    expect(screen.queryByLabelText('Close')).toBeNull();
  });
});

describe('modal presenters report when they are really shown', () => {
  it('fullscreen: onShown fires from the Modal onShow, not from mounting', async () => {
    const onShown = vi.fn();
    const view = buildMessageView(message(), 'en', LABELS);
    await render(<FullscreenPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} onShown={onShown} />);
    expect(onShown).not.toHaveBeenCalled();
    const modal = screen.root as unknown as { props: { onShow?: () => void } };
    expect(modal.props.onShow).toBeTypeOf('function');
    await act(async () => modal.props.onShow?.());
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it('card alert: onShown fires from the Modal onShow, not from mounting', async () => {
    const onShown = vi.fn();
    const view = buildMessageView(message({ presentation: 'alert' }), 'he', LABELS);
    await render(<AlertPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} onShown={onShown} />);
    expect(onShown).not.toHaveBeenCalled();
    const modal = screen.root as unknown as { props: { onShow?: () => void } };
    await act(async () => modal.props.onShow?.());
    expect(onShown).toHaveBeenCalledTimes(1);
  });
});

describe('sheet reports when it is really shown', () => {
  it('sheet: onShown fires from the Modal onShow, not from mounting', async () => {
    const onShown = vi.fn();
    const view = buildMessageView(message({ presentation: 'sheet' }), 'en', LABELS);
    await render(<SheetPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} onShown={onShown} />);
    expect(onShown).not.toHaveBeenCalled();
    const modal = screen.root as unknown as { props: { onShow?: () => void } };
    expect(modal.props.onShow).toBeTypeOf('function');
    await act(async () => modal.props.onShow?.());
    expect(onShown).toHaveBeenCalledTimes(1);
  });
});

describe('useModalShow: remount until the modal shows (iOS)', () => {
  const original = Platform.OS;
  afterEach(() => {
    Platform.OS = original;
    vi.useRealTimers();
  });

  it("remounts at a calm interval until onShow fires, then stops", async () => {
    Platform.OS = 'ios';
    vi.useFakeTimers();
    const onShown = vi.fn();
    const { result } = await renderHook(() => useModalShow(onShown));
    expect(result.current.modalKey).toBe(0);

    await act(async () => vi.advanceTimersByTime(MODAL_RETRY_MS - 1));
    expect(result.current.modalKey).toBe(0);
    await act(async () => vi.advanceTimersByTime(1));
    expect(result.current.modalKey).toBe(1);
    await act(async () => vi.advanceTimersByTime(MODAL_RETRY_MS));
    expect(result.current.modalKey).toBe(2);

    await act(async () => result.current.onShow());
    expect(onShown).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(MODAL_RETRY_MS * 5));
    expect(result.current.modalKey).toBe(2);
  });

  it("stops when the presenter goes away (the message is no longer the active one)", async () => {
    Platform.OS = 'ios';
    vi.useFakeTimers();
    const { result, unmount } = await renderHook(() => useModalShow(vi.fn()));
    const running = vi.getTimerCount();
    expect(running).toBeGreaterThan(0);
    await unmount();
    expect(vi.getTimerCount()).toBe(running - 1);
    expect(result.current.modalKey).toBe(0);
  });

  it("does not retry on Android or web, where modals stack", async () => {
    Platform.OS = 'android';
    vi.useFakeTimers();
    const { result } = await renderHook(() => useModalShow(vi.fn()));
    await act(async () => vi.advanceTimersByTime(MODAL_RETRY_MS * 3));
    expect(result.current.modalKey).toBe(0);
  });
});

describe('admin-only close control on a required message', () => {
  const required = () => message({ required: true, dismissible: false });

  it('is shown when the host gives it, hides the message without being a normal close, and is labelled admin-only', async () => {
    const onAdminHide = vi.fn();
    const onClose = vi.fn();
    const view = buildMessageView(required(), 'en', LABELS);
    await render(
      <FullscreenPresenter view={view} onAction={vi.fn()} onClose={onClose} onShown={vi.fn()} onAdminHide={onAdminHide} />,
    );
    await fireEvent.press(screen.getByLabelText(/Admin only/));
    expect(onAdminHide).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('is absent for everyone else: a required message looks exactly as before', async () => {
    const view = buildMessageView(required(), 'en', LABELS);
    await render(<FullscreenPresenter view={view} onAction={vi.fn()} onClose={vi.fn()} onShown={vi.fn()} />);
    expect(screen.queryByLabelText(/Admin only/)).toBeNull();
    expect(screen.queryByLabelText('Close')).toBeNull();
  });
});
