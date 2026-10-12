import { describe, expect, it } from 'vitest';

import {
  buildWelcomeEmail,
  safeMailHeader,
  WELCOME_MONTHLY_CREDITS,
} from '../../supabase/functions/_shared/welcomeEmail';

describe('buildWelcomeEmail', () => {
  const message = buildWelcomeEmail({
    appUrl: 'https://pinch-app.io/',
    supportEmail: 'hello@pinch-app.io',
  });

  it('explains the monthly allowance and that more credits can be bought', () => {
    expect(WELCOME_MONTHLY_CREDITS).toBe(3);
    expect(message.subject).toContain('3 free credits each month');
    expect(message.text).toContain('3 free recipe credits every month');
    expect(message.text).toContain('Purchased credits never expire');
    expect(message.text).toContain('Open Pinch: https://pinch-app.io');
    expect(message.html).toContain('free recipe credits');
    expect(message.html).toContain('buy extra credits');
    expect(message.html).toContain('href="https://pinch-app.io"');
    expect(message.html).toContain('hello@pinch-app.io');
  });

  it('drops an unsafe support address and keeps the app link on https', () => {
    const unsafe = buildWelcomeEmail({
      appUrl: 'javascript:alert(1)',
      supportEmail: 'not-an-email',
    });
    expect(unsafe.html).toContain('href="https://pinch-app.io"');
    expect(unsafe.html).not.toContain('not-an-email');
    expect(unsafe.html).not.toContain('javascript:');
  });

  it('escapes query characters in the app link', () => {
    const escaped = buildWelcomeEmail({
      appUrl: 'https://pinch-app.io/?from=welcome&ref=email',
    });
    expect(escaped.html).toContain('href="https://pinch-app.io/?from=welcome&amp;ref=email"');
    expect(escaped.html).not.toContain('href="https://pinch-app.io/?from=welcome&ref=email"');
  });
});

describe('safeMailHeader', () => {
  it('rejects blank values and line breaks', () => {
    expect(safeMailHeader('  Pinch <hello@pinch-app.io>  ')).toBe('Pinch <hello@pinch-app.io>');
    expect(safeMailHeader('hello\r\nBcc: evil@example.com')).toBeNull();
    expect(safeMailHeader('   ')).toBeNull();
    expect(safeMailHeader(null)).toBeNull();
  });
});
