import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import {
  fromFeedback,
  fromTicket,
  renderSupportEmail,
  supportFrom,
  supportSubject,
  type FeedbackRow,
  type TicketRow,
} from './support.ts';

function feedback(overrides: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    user_id: null,
    message: 'The share sheet\ndoesn’t show Pinch <b>on my phone</b>',
    source: 'website',
    contact_email: 'cook@example.com',
    app_version: '1.0.9',
    build_number: '42',
    platform: 'ios',
    os_version: 'iOS 19.1',
    device_model: 'iPhone 16',
    locale: 'he',
    created_at: '2026-11-15T21:30:00Z',
    ...overrides,
  };
}

function ticket(overrides: Partial<TicketRow> = {}): TicketRow {
  return {
    id: '99999999-2222-3333-4444-555555555555',
    user_id: 'user-2',
    email: 'baker@example.com',
    category: 'billing',
    message: 'I bought 30 credits but see 10',
    created_at: '2026-11-15T21:30:00Z',
    app_version: '1.0.9',
    platform: 'android',
    locale: 'es',
    ...overrides,
  };
}

Deno.test('the email body is only what they wrote, so replies quote nothing else', () => {
  for (const msg of [fromFeedback(feedback()), fromTicket(ticket())]) {
    const email = renderSupportEmail(msg);
    assertEquals(email.text, msg.message.trim());
    for (const secret of ['1.0.9', 'iPhone', 'iOS', 'android', 'user-1', 'user-2', '11111111', '99999999', 'he', 'es']) {
      if (msg.message.includes(secret)) continue;
      assert(!email.html.includes(`>${secret}<`) && !email.text.includes(secret), `${secret} leaked into the body`);
    }
    assert(!email.html.includes('Account'), 'no detail labels in the body');
  }
});

Deno.test('the message is escaped', () => {
  const email = renderSupportEmail(fromFeedback(feedback()));
  assert(!email.html.includes('<b>on my phone</b>'));
  assertStringIncludes(email.html, '&lt;b&gt;on my phone&lt;/b&gt;');
});

Deno.test('details travel in X-Pinch headers instead', () => {
  const fb = fromFeedback(feedback());
  assertEquals(fb.headers['X-Pinch-App-Version'], '1.0.9 (42)');
  assertEquals(fb.headers['X-Pinch-Platform'], 'ios / iOS 19.1');
  assertEquals(fb.headers['X-Pinch-Device'], 'iPhone 16');
  assertEquals(fb.headers['X-Pinch-Language'], 'he');
  assertEquals(fromFeedback(feedback({ user_id: 'user-1' })).headers['X-Pinch-Account-Id'], 'user-1');
  assertEquals(fb.headers['X-Pinch-Source'], 'website support form');
  const tk = fromTicket(ticket({ device_model: 'Pixel\r\nBcc: x@y.z' }));
  assertEquals(tk.headers['X-Pinch-Ticket-Id'], '99999999-2222-3333-4444-555555555555');
  assertEquals(tk.headers['X-Pinch-Device'], 'Pixel Bcc: x@y.z', 'no header injection');
  assert(!('X-Pinch-Build' in tk.headers));
});

Deno.test('a website visitor is answered at the address they typed', () => {
  assertEquals(fromFeedback(feedback()).replyTo, 'cook@example.com');
  assertEquals(fromFeedback(feedback({ contact_email: 'nope' })).replyTo, null);
  assertEquals(fromFeedback(feedback({ contact_email: null })).replyTo, null);
});

Deno.test('a signed-in sender is answered at the account address, whatever the row says', () => {
  const account = 'owner@example.com';
  assertEquals(fromTicket(ticket({ email: 'victim@example.com' }), account).replyTo, account);
  assertEquals(fromTicket(ticket({ email: 'victim@example.com' }), null).replyTo, null);
  assertEquals(fromFeedback(feedback({ user_id: 'user-1', contact_email: 'victim@example.com' }), account).replyTo, account);
  assertEquals(fromFeedback(feedback({ user_id: 'user-1', contact_email: 'victim@example.com' }), null).replyTo, null);
});

Deno.test('subject and sender name say what it is and who wrote', () => {
  assertEquals(supportSubject(fromTicket(ticket())), 'Pinch Billing: I bought 30 credits but see 10');
  assertEquals(supportSubject(fromFeedback(feedback({ source: 'app', message: 'Hi\nthere' }))), 'Pinch Feedback: Hi there');
  assert(supportSubject(fromFeedback(feedback({ message: 'word '.repeat(40) }))).endsWith('…'));
  assertEquals(supportFrom(fromTicket(ticket(), 'baker@example.com')), '"baker@example.com via Pinch" <hello@pinch-app.io>');
  assertEquals(supportFrom(fromTicket(ticket())), '"Someone via Pinch" <hello@pinch-app.io>');
});
