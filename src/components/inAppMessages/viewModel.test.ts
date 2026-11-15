import { describe, expect, it } from 'vitest';

import type { InAppMessage } from '@/lib/inAppMessages';

import { buildMessageView, canUseSystemAlert } from './viewModel';
import { resolveIconName, toneColors } from './tone';
import { getThemePackColors } from '@/constants/themes';

const LABELS = { update: 'Update', learnMore: 'Learn more', close: 'Close' };

function message(extra: Partial<InAppMessage> = {}): InAppMessage {
  return {
    id: 'm1',
    presentation: 'alert',
    tone: 'info',
    content: {
      en: { title: 'Hello', body: 'World', primaryLabel: 'Open', secondaryLabel: 'Later' },
      he: { title: 'שלום', body: 'עולם', primaryLabel: 'פתיחה' },
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

describe('buildMessageView: language and direction', () => {
  it('shows Hebrew content right-to-left to a Hebrew user (E)', () => {
    const view = buildMessageView(message(), 'he', LABELS);
    expect(view.title).toBe('שלום');
    expect(view.contentLanguage).toBe('he');
    expect(view.rtl).toBe(true);
  });

  it('shows English, left-to-right, to a user whose language has no content (E)', () => {
    const view = buildMessageView(message(), 'ru', LABELS);
    expect(view.title).toBe('Hello');
    expect(view.rtl).toBe(false);
  });

  it('lays an English fallback out left-to-right even for a Hebrew user', () => {
    const view = buildMessageView(message({ content: { en: { title: 'Hi', body: '' } } }), 'he', LABELS);
    expect(view.contentLanguage).toBe('en');
    expect(view.rtl).toBe(false);
  });

  it('falls back to the English label for a button the language leaves blank', () => {
    const view = buildMessageView(message(), 'he', LABELS);
    expect(view.buttons.map((b) => b.label)).toEqual(['פתיחה', 'Later']);
  });
});

describe('buildMessageView: buttons and link', () => {
  it('puts the primary button first and fills it', () => {
    const view = buildMessageView(message(), 'en', LABELS);
    expect(view.buttons.map((b) => [b.kind, b.style])).toEqual([
      ['primary', 'primary'],
      ['secondary', 'secondary'],
    ]);
  });

  it('shows no dismiss button on a message that cannot be dismissed', () => {
    const view = buildMessageView(message({ dismissible: false }), 'en', LABELS);
    expect(view.dismissible).toBe(false);
    expect(view.buttons.map((b) => b.action.type)).toEqual(['route']);
  });

  it('uses the default label for a link with none', () => {
    const view = buildMessageView(message({ link: { url: 'https://example.com' } }), 'en', LABELS);
    expect(view.link).toEqual({ label: 'Learn more', url: 'https://example.com' });
  });

  it('uses the admin link label when there is one', () => {
    const content = { en: { title: 'T', body: '', linkLabel: 'Read more here' } };
    const view = buildMessageView(message({ content, link: { url: 'https://example.com' } }), 'en', LABELS);
    expect(view.link?.label).toBe('Read more here');
  });
});

describe('buildMessageView: required (D)', () => {
  const required = message({
    required: true,
    dismissible: false,
    presentation: 'banner',
    primaryAction: undefined,
    secondaryAction: { type: 'dismiss' },
  });

  it('is always full screen, cannot be dismissed, and offers the store button', () => {
    const view = buildMessageView(required, 'en', LABELS);
    expect(view.presentation).toBe('fullscreen');
    expect(view.dismissible).toBe(false);
    expect(view.buttons).toEqual([
      { kind: 'primary', label: 'Update', action: { type: 'store' }, style: 'primary' },
    ]);
  });

  it('keeps the admin store button instead of adding another', () => {
    const view = buildMessageView(
      message({ required: true, dismissible: false, primaryAction: { type: 'store' } }),
      'en',
      LABELS,
    );
    expect(view.buttons.filter((b) => b.action.type === 'store')).toHaveLength(1);
    expect(view.buttons[0]?.label).toBe('Open');
  });

  it('cannot be dismissed even when the row says dismissible', () => {
    const view = buildMessageView(message({ required: true, dismissible: true }), 'en', LABELS);
    expect(view.dismissible).toBe(false);
  });
});

describe('canUseSystemAlert', () => {
  const view = (extra: Partial<InAppMessage> = {}, language = 'en') => buildMessageView(message(extra), language, LABELS);

  it('uses the system alert on iOS and Android when directions match', () => {
    expect(canUseSystemAlert(view(), { platform: 'ios', deviceRtl: false })).toBe(true);
    expect(canUseSystemAlert(view(), { platform: 'android', deviceRtl: false })).toBe(true);
    expect(canUseSystemAlert(view({}, 'he'), { platform: 'ios', deviceRtl: true })).toBe(true);
  });

  it('never uses it on web', () => {
    expect(canUseSystemAlert(view(), { platform: 'web', deviceRtl: false })).toBe(false);
  });

  it('uses the card when the device direction differs from the message language', () => {
    expect(canUseSystemAlert(view({}, 'he'), { platform: 'ios', deviceRtl: false })).toBe(false);
    expect(canUseSystemAlert(view(), { platform: 'android', deviceRtl: true })).toBe(false);
  });

  it('uses the card for an image, or when buttons and link need more than two places', () => {
    expect(canUseSystemAlert(view({ imageUrl: 'https://example.com/a.png' }), { platform: 'ios', deviceRtl: false })).toBe(false);
    expect(canUseSystemAlert(view({ link: { url: 'https://example.com' } }), { platform: 'ios', deviceRtl: false })).toBe(false);
    expect(
      canUseSystemAlert(view({ link: { url: 'https://example.com' }, secondaryAction: undefined }), {
        platform: 'ios',
        deviceRtl: false,
      }),
    ).toBe(true);
  });

  it('is only for the alert way of showing', () => {
    expect(canUseSystemAlert(view({ presentation: 'sheet' }), { platform: 'ios', deviceRtl: false })).toBe(false);
    expect(canUseSystemAlert(view({ required: true, dismissible: false }), { platform: 'ios', deviceRtl: false })).toBe(false);
  });
});

describe('tone', () => {
  const colors = getThemePackColors('mist', 'light');

  it('maps each tone to its theme colour', () => {
    expect(toneColors('info', colors).accent).toBe(colors.primary);
    expect(toneColors('success', colors).accent).toBe(colors.success);
    expect(toneColors('warning', colors).accent).toBe(colors.warning);
    expect(toneColors('critical', colors).accent).toBe(colors.danger);
  });

  it('uses the admin icon when the set has it, else the tone icon', () => {
    expect(resolveIconName('sparkles', 'info', { sparkles: 1 })).toBe('sparkles');
    expect(resolveIconName('not-an-icon', 'critical', { sparkles: 1 })).toBe('alert-circle');
    expect(resolveIconName(undefined, 'success', {})).toBe('checkmark-circle');
  });
});
