import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { renderSupportEmail, replyAddress, supportSubject, type FeedbackRow } from './support.ts';

function row(overrides: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    user_id: null,
    message: 'The share sheet\ndoesn’t show Pinch <b>on my phone</b>',
    source: 'website',
    contact_email: 'cook@example.com',
    app_version: null,
    build_number: null,
    platform: 'web',
    os_version: null,
    device_model: null,
    locale: 'he',
    created_at: '2026-11-15T21:30:00Z',
    profile: null,
    ...overrides,
  };
}

Deno.test('reply goes to the website email, else the account email', () => {
  assertEquals(replyAddress(row()), 'cook@example.com');
  assertEquals(replyAddress(row({ contact_email: null, profile: { email: 'me@example.com' } })), 'me@example.com');
  assertEquals(replyAddress(row({ contact_email: null })), null);
  assertEquals(replyAddress(row({ contact_email: 'not an email' })), null);
});

Deno.test('subject previews the message on one line', () => {
  assertEquals(supportSubject(row({ message: 'Hi\nthere' })), 'Pinch support: Hi there');
  const long = supportSubject(row({ message: 'word '.repeat(40) }));
  assert(long.length <= 'Pinch support: '.length + 58);
  assert(long.endsWith('…'));
});

Deno.test('support email escapes the message and lists the details', () => {
  const email = renderSupportEmail(
    row({ source: 'app', user_id: 'u-1', app_version: '1.0.9', build_number: '42', device_model: 'iPhone 16' }),
  );
  assert(!email.html.includes('<b>on my phone</b>'));
  assertStringIncludes(email.html, '&lt;b&gt;on my phone&lt;/b&gt;');
  for (const piece of ['App · Send feedback', '1.0.9 (42)', 'iPhone 16', 'u-1', 'cook@example.com', 'Hit Reply']) {
    assertStringIncludes(email.html, piece);
  }
  assertStringIncludes(email.text, 'doesn’t show Pinch');
});

Deno.test('support email says when there is no one to reply to', () => {
  const email = renderSupportEmail(row({ contact_email: null }));
  assertStringIncludes(email.html, 'can’t be answered');
});
