/**
 * `askConfirm()` and `showNotice()`: on the web, drawn by the host with the real English strings; on a phone, the
 * system alert. React Native Testing Library v14: render and fireEvent are async, always await them.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Platform, type AlertButton } from 'react-native';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { getThemePackColors } from '@shared/constants/themes';
import { initI18n } from '@/i18n/config';
import { askConfirm, currentDialog, settleDialog, showNotice } from '@/lib/dialog';

import { DialogHost } from './DialogHost';

vi.mock('@/hooks/useThemePreference', () => ({
  useThemePreference: () => ({ colors: getThemePackColors('mist', 'light'), packId: 'mist' }),
}));
// The kit's Text reads the app language for its fonts.
vi.mock('@/hooks/useLanguagePreference', () => ({ useLanguagePreference: () => ({ language: 'en' }) }));
vi.mock('@/hooks/useRtl', () => ({
  useRtl: () => ({ rtl: false, writingDirection: 'ltr', textAlign: 'left' }),
}));
vi.mock('@/lib/interactionLog', () => ({ logTap: vi.fn() }));
vi.mock('@expo/vector-icons/Ionicons', async () => {
  const { Text } = await import('react-native');
  const Icon = ({ name }: { name: string }) => <Text testID={`icon-${name}`} />;
  Icon.glyphMap = {};
  return { default: Icon };
});

const realPlatform = Platform.OS;

beforeAll(() => {
  initI18n('en');
});

afterAll(() => {
  Platform.OS = realPlatform;
});

function onPlatform(os: typeof Platform.OS) {
  beforeAll(() => {
    Platform.OS = os;
  });
}

/** Android back and the web Escape key reach the Modal's onRequestClose (the root host element here). */
function requestClose() {
  const modal = screen.root as unknown as { props: { onRequestClose?: () => void } };
  expect(modal.props.onRequestClose).toBeTypeOf('function');
  modal.props.onRequestClose?.();
}

/**
 * Asks from outside React, as a screen's handler does, and lets the host draw it. The answer comes wrapped, because
 * an async function that returned the promise itself would wait for it.
 */
async function ask<T>(question: () => Promise<T>): Promise<{ answer: Promise<T> }> {
  let answer!: Promise<T>;
  await act(async () => {
    answer = question();
  });
  return { answer };
}

describe('DialogHost on the web', () => {
  onPlatform('web');

  it('draws nothing until something is asked', async () => {
    await render(<DialogHost />);
    expect(screen.toJSON()).toBeNull();
  });

  it('asks a question and answers true on the confirm button', async () => {
    await render(<DialogHost />);
    const { answer } = await ask(() =>
      askConfirm({ title: 'Delete account?', message: "It can't be undone.", confirmLabel: 'Delete account' }),
    );

    expect(screen.getByText('Delete account?')).toBeTruthy();
    expect(screen.getByText("It can't be undone.")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Delete account'));

    await expect(answer).resolves.toBe(true);
    expect(screen.toJSON()).toBeNull();
  });

  it('answers false on Cancel, and on back or Escape', async () => {
    await render(<DialogHost />);

    const { answer: cancelled } = await ask(() => askConfirm({ title: 'Discard?', message: 'The draft goes.' }));
    await fireEvent.press(screen.getByLabelText('Cancel'));
    await expect(cancelled).resolves.toBe(false);

    const { answer: backedOut } = await ask(() => askConfirm({ title: 'Discard?', message: 'The draft goes.' }));
    await act(async () => requestClose());
    await expect(backedOut).resolves.toBe(false);
  });

  it('uses the labels it is given', async () => {
    await render(<DialogHost />);
    const { answer } = await ask(() =>
      askConfirm({ title: 'Reminders?', message: 'A couple a week.', confirmLabel: 'Turn on', cancelLabel: 'Not now' }),
    );
    expect(screen.queryByLabelText('Cancel')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Not now'));
    await expect(answer).resolves.toBe(false);
  });

  it('shows a notice with one button and no Cancel', async () => {
    await render(<DialogHost />);
    const { answer: closed } = await ask(() =>
      showNotice({ title: 'Account deleted', message: 'Thanks for cooking with Pinch.' }),
    );

    expect(screen.getByText('Account deleted')).toBeTruthy();
    expect(screen.queryByLabelText('Cancel')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Dismiss'));

    await expect(closed).resolves.toBeUndefined();
    expect(screen.toJSON()).toBeNull();
  });

  it('closes a notice on back or Escape too', async () => {
    await render(<DialogHost />);
    const { answer: closed } = await ask(() =>
      showNotice({ title: 'Couldn’t send', message: 'Try again.', okLabel: 'OK' }),
    );
    expect(screen.getByLabelText('OK')).toBeTruthy();
    await act(async () => requestClose());
    await expect(closed).resolves.toBeUndefined();
  });

  it('shows one at a time, in the order asked', async () => {
    await render(<DialogHost />);
    const { answer: first } = await ask(() => askConfirm({ title: 'First?', message: 'One.' }));
    const { answer: second } = await ask(() => showNotice({ title: 'Second', message: 'Two.' }));

    expect(screen.getByText('First?')).toBeTruthy();
    expect(screen.queryByText('Second')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Continue'));
    await expect(first).resolves.toBe(true);
    expect(screen.getByText('Second')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Dismiss'));
    await expect(second).resolves.toBeUndefined();
  });

  it('shows a dialog asked before the host was mounted', async () => {
    const answer = askConfirm({ title: 'Early?', message: 'Asked at launch.' });
    await render(<DialogHost />);
    await fireEvent.press(screen.getByLabelText('Continue'));
    await expect(answer).resolves.toBe(true);
  });
});

describe('settleDialog', () => {
  onPlatform('web');

  it('ignores an answer for a dialog that is not the one showing', async () => {
    const answer = askConfirm({ title: 'Only one', message: 'Still open.' });
    const showing = currentDialog();
    expect(showing?.title).toBe('Only one');

    settleDialog((showing?.id ?? 0) + 100, true);
    expect(currentDialog()).toBe(showing);

    settleDialog(showing?.id ?? 0, false);
    await expect(answer).resolves.toBe(false);
    expect(currentDialog()).toBeNull();
  });
});

describe('on a phone', () => {
  onPlatform('ios');
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The buttons of the one system alert that was shown. */
  function alertButtons(alert: { mock: { calls: unknown[][] } }): AlertButton[] {
    expect(alert.mock.calls).toHaveLength(1);
    return alert.mock.calls[0][2] as AlertButton[];
  }

  it('asks in the system alert, not the app dialog', async () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<DialogHost />);
    const { answer } = await ask(() =>
      askConfirm({ title: 'Delete account?', message: "It can't be undone.", confirmLabel: 'Delete', destructive: true }),
    );

    expect(screen.toJSON()).toBeNull();
    expect(currentDialog()).toBeNull();
    expect(alert).toHaveBeenCalledWith('Delete account?', "It can't be undone.", expect.any(Array));
    const [cancel, confirm] = alertButtons(alert);
    expect(cancel).toMatchObject({ text: 'Cancel', style: 'cancel' });
    expect(confirm).toMatchObject({ text: 'Delete', style: 'destructive' });

    confirm.onPress?.();
    await expect(answer).resolves.toBe(true);
  });

  it("answers false on the alert's cancel button, with the label it was given", async () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const answer = askConfirm({ title: 'Reminders?', message: 'A couple a week.', cancelLabel: 'Not now' });
    const [cancel, confirm] = alertButtons(alert);
    expect(cancel.text).toBe('Not now');
    expect(confirm).toMatchObject({ text: 'Continue', style: 'default' });

    cancel.onPress?.();
    await expect(answer).resolves.toBe(false);
  });

  it('shows a notice as a system alert with one OK button', async () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const closed = showNotice({ title: 'Account deleted', message: 'Thanks for cooking with Pinch.' });
    const buttons = alertButtons(alert);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text).toBe('OK');
    expect(currentDialog()).toBeNull();

    buttons[0].onPress?.();
    await expect(closed).resolves.toBeUndefined();
  });
});
