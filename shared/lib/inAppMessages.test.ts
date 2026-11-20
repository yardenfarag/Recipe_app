import { describe, expect, it } from 'vitest';

import {
  applyMessageEvent,
  compareVersions,
  isDismissible,
  isMessageDue,
  matchesScreen,
  messageButtons,
  nextMessageToShow,
  normalizeLanguage,
  pickContent,
  resolveContentLanguage,
  validateMessage,
  type AdminMessageDraft,
  type InAppMessage,
  type MessageReceipt,
} from './inAppMessages';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const LAUNCH = NOW - 60 * 60 * 1000; // launched an hour ago

function message(overrides: Partial<InAppMessage> = {}): InAppMessage {
  return {
    id: 'm1',
    presentation: 'alert',
    tone: 'info',
    content: { en: { title: 'Hello', body: 'World' } },
    dismissible: true,
    required: false,
    frequency: { type: 'once' },
    priority: 0,
    ...overrides,
  };
}

function receipt(overrides: Partial<MessageReceipt> = {}): MessageReceipt {
  return {
    messageId: 'm1',
    firstSeenAt: new Date(NOW - 10 * DAY).toISOString(),
    lastSeenAt: new Date(NOW - 10 * DAY).toISOString(),
    seenCount: 1,
    dismissedAt: null,
    clickedAt: null,
    clickedButton: null,
    ...overrides,
  };
}

describe('language fallback', () => {
  const content = {
    en: { title: 'Update', body: 'Please update', primaryLabel: 'Update now', secondaryLabel: 'Later' },
    he: { title: 'עדכון', body: 'אנא עדכנו', primaryLabel: 'עדכנו' },
  };

  it('uses the language the user speaks when the message has it', () => {
    expect(pickContent({ content }, 'he').title).toBe('עדכון');
    expect(resolveContentLanguage({ content }, 'he')).toBe('he');
  });

  it('reads regional and legacy codes', () => {
    expect(normalizeLanguage('he-IL')).toBe('he');
    expect(normalizeLanguage('iw')).toBe('he');
    expect(normalizeLanguage('ES_mx')).toBe('es');
    expect(normalizeLanguage('')).toBe('en');
    expect(pickContent({ content }, 'he-IL').title).toBe('עדכון');
  });

  it('shows English to a user whose language has no content', () => {
    expect(pickContent({ content }, 'ru')).toEqual(content.en);
    expect(resolveContentLanguage({ content }, 'ru')).toBe('en');
    expect(resolveContentLanguage({ content }, null)).toBe('en');
  });

  it('treats a language with a blank title as missing', () => {
    const blank = { en: content.en, he: { title: '  ', body: 'x' } };
    expect(pickContent({ content: blank }, 'he').title).toBe('Update');
  });

  it('takes a button label missing in the language from English', () => {
    const picked = pickContent({ content }, 'he');
    expect(picked.primaryLabel).toBe('עדכנו');
    expect(picked.secondaryLabel).toBe('Later');
  });

  it('falls back to whatever language exists when English is missing', () => {
    const onlyHebrew = { he: { title: 'שלום', body: '' } };
    expect(pickContent({ content: onlyHebrew }, 'ru').title).toBe('שלום');
    expect(resolveContentLanguage({ content: onlyHebrew }, 'ru')).toBe('he');
  });

  it('builds the buttons from the actions and the picked labels', () => {
    const buttons = messageButtons(
      { content, primaryAction: { type: 'store' }, secondaryAction: { type: 'dismiss' } },
      'he',
    );
    expect(buttons).toEqual([
      { label: 'עדכנו', action: { type: 'store' }, style: 'primary' },
      { label: 'Later', action: { type: 'dismiss' }, style: 'secondary' },
    ]);
    expect(messageButtons({ content, primaryAction: undefined, secondaryAction: undefined }, 'en')).toEqual([]);
  });
});

describe('compareVersions', () => {
  it('compares part by part, not as text', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('1.0.9', '1.0.10')).toBe(-1);
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });

  it('treats missing parts as zero', () => {
    expect(compareVersions('2', '2.0.0')).toBe(0);
    expect(compareVersions('1.4', '1.4.1')).toBe(-1);
  });

  it('ignores a -dev suffix', () => {
    expect(compareVersions('1.0.9-dev', '1.0.9')).toBe(0);
    expect(compareVersions('1.0.10-dev', '1.0.9')).toBe(1);
    expect(compareVersions('1.0.9+build5', '1.0.9')).toBe(0);
  });

  it('counts an unreadable version as 0', () => {
    expect(compareVersions('', '0.0.1')).toBe(-1);
    expect(compareVersions('abc', '0')).toBe(0);
  });
});

describe('screen filter', () => {
  it('shows anywhere when no screens are listed', () => {
    expect(matchesScreen(undefined, '/hub')).toBe(true);
    expect(matchesScreen([], '/hub')).toBe(true);
  });

  it('matches a route pattern, ignoring (group) segments and a query', () => {
    expect(matchesScreen(['/(tabs)/hub'], '/hub')).toBe(true);
    expect(matchesScreen(['/hub'], '/(tabs)/hub')).toBe(true);
    expect(matchesScreen(['/hub'], '/hub/?a=1')).toBe(true);
    expect(matchesScreen(['/hub'], '/settings')).toBe(false);
  });

  it('matches dynamic and wildcard segments', () => {
    expect(matchesScreen(['/recipe/[id]'], '/recipe/42')).toBe(true);
    expect(matchesScreen(['/recipe/[id]'], '/recipe/42/edit')).toBe(false);
    expect(matchesScreen(['/recipe/*'], '/recipe/42/edit')).toBe(true);
    expect(matchesScreen(['/admin/*'], '/hub')).toBe(false);
  });

  it('does not show on an unknown route when screens are listed', () => {
    expect(matchesScreen(['/hub'], null)).toBe(false);
  });
});

describe('required beats dismissible', () => {
  it('cannot be dismissed when required, even if dismissible says yes', () => {
    expect(isDismissible({ dismissible: true, required: true })).toBe(false);
    expect(isDismissible({ dismissible: true, required: false })).toBe(true);
    expect(isDismissible({ dismissible: false, required: false })).toBe(false);
  });

  it('is due again and again until the targeting stops matching', () => {
    const required = message({ required: true, frequency: { type: 'once' }, maxShows: 1 });
    const seen = receipt({ seenCount: 5, dismissedAt: new Date(NOW - DAY).toISOString() });
    expect(isMessageDue(required, seen, NOW, { launchedAt: LAUNCH })).toBe(true);
  });
});

describe('frequency', () => {
  const opts = { launchedAt: LAUNCH };

  it('once: shows until seen, then never, across restarts', () => {
    const m = message({ frequency: { type: 'once' } });
    expect(isMessageDue(m, undefined, NOW, opts)).toBe(true);
    expect(isMessageDue(m, receipt(), NOW, opts)).toBe(false);
    // A restart later still has the receipt, so it stays gone.
    expect(isMessageDue(m, receipt(), NOW + 30 * DAY, { launchedAt: NOW + 30 * DAY })).toBe(false);
  });

  it('every launch: due once per launch', () => {
    const m = message({ frequency: { type: 'every_launch' } });
    expect(isMessageDue(m, undefined, NOW, opts)).toBe(true);
    expect(isMessageDue(m, receipt({ lastSeenAt: new Date(NOW - DAY).toISOString() }), NOW, opts)).toBe(true);
    expect(isMessageDue(m, receipt({ lastSeenAt: new Date(NOW - 60 * 1000).toISOString() }), NOW, opts)).toBe(false);
  });

  it('every N days: due after N days', () => {
    const m = message({ frequency: { type: 'every_n_days', days: 3 } });
    expect(isMessageDue(m, receipt({ lastSeenAt: new Date(NOW - 2 * DAY).toISOString() }), NOW, opts)).toBe(false);
    expect(isMessageDue(m, receipt({ lastSeenAt: new Date(NOW - 3 * DAY).toISOString() }), NOW, opts)).toBe(true);
    expect(isMessageDue(m, undefined, NOW, opts)).toBe(true);
  });

  it('until dismissed: keeps showing until dismissed', () => {
    const m = message({ frequency: { type: 'until_dismissed' } });
    expect(isMessageDue(m, receipt({ seenCount: 4 }), NOW, opts)).toBe(true);
    expect(isMessageDue(m, receipt({ dismissedAt: new Date(NOW - DAY).toISOString() }), NOW, opts)).toBe(false);
  });

  it('max shows: stops after that many sightings, whatever the frequency', () => {
    const m = message({ frequency: { type: 'every_launch' }, maxShows: 3 });
    const old = new Date(NOW - 2 * DAY).toISOString();
    expect(isMessageDue(m, receipt({ seenCount: 2, lastSeenAt: old }), NOW, opts)).toBe(true);
    expect(isMessageDue(m, receipt({ seenCount: 3, lastSeenAt: old }), NOW, opts)).toBe(false);
  });
});

describe('nextMessageToShow', () => {
  const opts = { launchedAt: LAUNCH };

  it('returns null when there is nothing to show', () => {
    expect(nextMessageToShow([], {}, '/hub', NOW, opts)).toBeNull();
    expect(nextMessageToShow([message()], { m1: receipt() }, '/hub', NOW, opts)).toBeNull();
  });

  it('picks the highest priority among the due messages', () => {
    const low = message({ id: 'low', priority: 1 });
    const high = message({ id: 'high', priority: 9 });
    const mid = message({ id: 'mid', priority: 5 });
    expect(nextMessageToShow([low, high, mid], {}, '/hub', NOW, opts)?.id).toBe('high');
  });

  it('skips a higher priority message that is not due or not for this screen', () => {
    const seen = message({ id: 'seen', priority: 9 });
    const elsewhere = message({ id: 'elsewhere', priority: 8, screens: ['/settings'] });
    const ok = message({ id: 'ok', priority: 1 });
    const receipts = { seen: receipt({ messageId: 'seen' }) };
    expect(nextMessageToShow([seen, elsewhere, ok], receipts, '/hub', NOW, opts)?.id).toBe('ok');
    expect(nextMessageToShow([seen, elsewhere, ok], receipts, '/settings', NOW, opts)?.id).toBe('elsewhere');
  });

  it('puts a required message first at equal priority, then keeps the given order', () => {
    const a = message({ id: 'a' });
    const b = message({ id: 'b' });
    const req = message({ id: 'req', required: true });
    expect(nextMessageToShow([a, b], {}, '/hub', NOW, opts)?.id).toBe('a');
    expect(nextMessageToShow([a, b, req], {}, '/hub', NOW, opts)?.id).toBe('req');
  });

  it('does not let a required message jump a higher priority one', () => {
    const req = message({ id: 'req', required: true, priority: 1 });
    const top = message({ id: 'top', priority: 5 });
    expect(nextMessageToShow([req, top], {}, '/hub', NOW, opts)?.id).toBe('top');
  });
});

describe('applyMessageEvent', () => {
  it('creates a receipt on the first sighting and counts later ones', () => {
    const first = applyMessageEvent('m1', undefined, 'seen', NOW);
    expect(first.seenCount).toBe(1);
    expect(first.firstSeenAt).toBe(new Date(NOW).toISOString());
    const second = applyMessageEvent('m1', first, 'seen', NOW + 1000);
    expect(second.seenCount).toBe(2);
    expect(second.firstSeenAt).toBe(first.firstSeenAt);
    expect(second.lastSeenAt).toBe(new Date(NOW + 1000).toISOString());
  });

  it('records a dismissal and a tap with the button', () => {
    const seen = applyMessageEvent('m1', undefined, 'seen', NOW);
    const dismissed = applyMessageEvent('m1', seen, 'dismissed', NOW + 1);
    expect(dismissed.dismissedAt).toBe(new Date(NOW + 1).toISOString());
    const clicked = applyMessageEvent('m1', dismissed, 'clicked', NOW + 2, 'secondary');
    expect(clicked.clickedButton).toBe('secondary');
    expect(clicked.seenCount).toBe(1);
  });

  it('counts a dismissal with no earlier sighting as a first sighting', () => {
    const dismissed = applyMessageEvent('m1', undefined, 'dismissed', NOW);
    expect(dismissed.seenCount).toBe(1);
    expect(dismissed.dismissedAt).not.toBeNull();
  });
});

describe('validateMessage', () => {
  function draft(overrides: Partial<AdminMessageDraft> = {}): AdminMessageDraft {
    return {
      name: 'Test',
      presentation: 'alert',
      tone: 'info',
      content: { en: { title: 'Hello', body: 'World' } },
      dismissible: true,
      required: false,
      frequency: { type: 'once' },
      priority: 0,
      startsAt: null,
      endsAt: null,
      targeting: {},
      ...overrides,
    };
  }
  const fields = (d: Partial<AdminMessageDraft>) => validateMessage(d).map((issue) => issue.field);

  it('accepts a plain message', () => {
    expect(validateMessage(draft())).toEqual([]);
  });

  it('needs a name, a presentation and an English title', () => {
    expect(fields(draft({ name: ' ' }))).toContain('name');
    expect(fields(draft({ presentation: undefined as never }))).toContain('presentation');
    expect(fields(draft({ content: { he: { title: 'שלום', body: '' } } }))).toContain('content.en.title');
  });

  it('checks the limits the table checks', () => {
    expect(fields(draft({ content: { en: { title: 'x'.repeat(121), body: '' } } }))).toContain('content.en.title');
    expect(fields(draft({ content: { en: { title: 'x', body: 'y'.repeat(1501) } } }))).toContain('content.en.body');
    expect(fields(draft({ maxShows: 0 }))).toContain('maxShows');
    expect(fields(draft({ priority: 5000 }))).toContain('priority');
    expect(fields(draft({ frequency: { type: 'every_n_days', days: 0 } }))).toContain('frequency');
    expect(fields(draft({ imageUrl: 'http://example.com/a.png' }))).toContain('imageUrl');
  });

  it('needs an https link, an app path for a route, and a label for each button', () => {
    expect(fields(draft({ primaryAction: { type: 'link', url: 'javascript:alert(1)' } }))).toContain('primaryAction');
    expect(fields(draft({ primaryAction: { type: 'route', href: '//evil.example' } }))).toContain('primaryAction');
    expect(fields(draft({ primaryAction: { type: 'store' } }))).toContain('primaryAction'); // no label
    expect(
      validateMessage(
        draft({
          content: { en: { title: 'Hi', body: '', primaryLabel: 'Update' } },
          primaryAction: { type: 'store' },
        }),
      ),
    ).toEqual([]);
  });

  it('wants an end after the start and a version range that is a range', () => {
    expect(fields(draft({ startsAt: '2026-11-20T00:00:00Z', endsAt: '2026-11-19T00:00:00Z' }))).toContain('endsAt');
    expect(fields(draft({ targeting: { minAppVersion: '2.0', maxAppVersion: '1.5' } }))).toContain(
      'targeting.maxAppVersion',
    );
    expect(fields(draft({ targeting: { minAppVersion: '1.0', maxAppVersion: '1.5' } }))).toEqual([]);
    expect(fields(draft({ targeting: { userIds: ['not-a-uuid'] } }))).toContain('targeting.userIds');
  });

  it('wants a required message to lead somewhere', () => {
    expect(fields(draft({ required: true }))).toContain('primaryAction');
    expect(
      validateMessage(
        draft({
          required: true,
          content: { en: { title: 'Update', body: '', primaryLabel: 'Update' } },
          primaryAction: { type: 'store' },
        }),
      ),
    ).toEqual([]);
  });
});
