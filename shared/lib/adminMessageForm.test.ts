import { describe, expect, it } from 'vitest';

import { validateMessage, type AdminMessage } from './inAppMessages';

import {
  alertLimits,
  applyPreset,
  describeTargeting,
  describeWindow,
  draftFromForm,
  duplicateForm,
  emptyForm,
  formFromMessage,
  formIssues,
  formatLocalTime,
  issuesFor,
  parseLocalTime,
  parseUsers,
  resolveUsers,
  setPresentation,
  setRequired,
  splitScreens,
  statusActions,
  testDraft,
  type MessageForm,
} from './adminMessageForm';

const ADMIN = '123e4567-e89b-12d3-a456-426614174000';
const OTHER = '223e4567-e89b-12d3-a456-426614174001';

function filled(overrides: Partial<MessageForm> = {}): MessageForm {
  const form = emptyForm();
  form.name = 'Spring news';
  form.content.en = { ...form.content.en!, title: 'Hello', body: 'Body text' };
  return { ...form, ...overrides };
}

describe('required and the way of showing', () => {
  it('switching required on switches to full screen and makes it non-dismissible', () => {
    const next = setRequired(filled({ presentation: 'banner' }), true);
    expect(next.required).toBe(true);
    expect(next.presentation).toBe('fullscreen');
    expect(next.dismissible).toBe(false);
  });

  it('leaving full screen turns required off', () => {
    const required = setRequired(filled(), true);
    const next = setPresentation(required, 'sheet');
    expect(next.required).toBe(false);
    expect(next.dismissible).toBe(true);
  });

  it('switching required off makes it dismissible again', () => {
    const next = setRequired(setRequired(filled(), true), false);
    expect(next.required).toBe(false);
    expect(next.dismissible).toBe(true);
    expect(next.presentation).toBe('fullscreen');
  });

  it('draftFromForm never saves required with another way of showing', () => {
    const stale = filled({ required: true, presentation: 'banner', dismissible: true });
    const draft = draftFromForm(stale, []);
    expect(draft.presentation).toBe('fullscreen');
    expect(draft.dismissible).toBe(false);
  });
});

describe('alert limits', () => {
  it('an alert has no image, icon or link', () => {
    expect(alertLimits({ presentation: 'alert' })).toEqual({ image: false, icon: false, link: false });
    expect(alertLimits({ presentation: 'sheet' })).toEqual({ image: true, icon: true, link: true });
  });

  it('draftFromForm drops image, icon and link from an alert', () => {
    const draft = draftFromForm(
      filled({ presentation: 'alert', imageUrl: 'https://x.test/a.png', icon: 'gift-outline', linkUrl: 'https://x.test' }),
      [],
    );
    expect(draft.imageUrl).toBeUndefined();
    expect(draft.icon).toBeUndefined();
    expect(draft.link).toBeUndefined();
  });

  it('a sheet keeps them', () => {
    const draft = draftFromForm(filled({ imageUrl: 'https://x.test/a.png', icon: 'gift-outline' }), []);
    expect(draft.imageUrl).toBe('https://x.test/a.png');
    expect(draft.icon).toBe('gift-outline');
  });
});

describe('draftFromForm', () => {
  it('turns the text inputs into numbers, times and lists', () => {
    const form = filled({
      frequency: 'every_n_days',
      everyNDays: '3',
      maxShows: '5',
      priority: '10',
      delaySeconds: '4',
      screens: '/(tabs)/hub\n/(tabs)/list, /(tabs)/hub',
      startsAt: '2026-12-01 09:30',
      endsAt: '2026-12-02',
      plans: ['pro'],
      platforms: ['ios', 'web'],
      languages: ['he'],
      minAppVersion: '1.2',
      maxAppVersion: ' 1.5 ',
    });
    const draft = draftFromForm(form, [ADMIN]);
    expect(draft.frequency).toEqual({ type: 'every_n_days', days: 3 });
    expect(draft.maxShows).toBe(5);
    expect(draft.priority).toBe(10);
    expect(draft.delaySeconds).toBe(4);
    expect(draft.screens).toEqual(['/(tabs)/hub', '/(tabs)/list']);
    expect(new Date(draft.startsAt as string).getTime()).toBe(new Date(2026, 11, 1, 9, 30).getTime());
    expect(new Date(draft.endsAt as string).getTime()).toBe(new Date(2026, 11, 2, 0, 0).getTime());
    expect(draft.targeting).toEqual({
      userIds: [ADMIN],
      plans: ['pro'],
      platforms: ['ios', 'web'],
      languages: ['he'],
      minAppVersion: '1.2',
      maxAppVersion: '1.5',
    });
  });

  it('leaves out languages nobody wrote in, and button labels of buttons that are off', () => {
    const form = filled();
    form.content.he = { ...form.content.he!, primaryLabel: 'כפתור' };
    form.content.en = { ...form.content.en!, primaryLabel: 'Go' };
    const draft = draftFromForm(form, []);
    // he has only a label, typed while the button is off, so it is not a written language.
    expect(Object.keys(draft.content)).toEqual(['en']);
    expect(draft.content.en).toEqual({ title: 'Hello', body: 'Body text' });
  });

  it('keeps button labels only while the button is on', () => {
    const form = filled({ primary: { enabled: true, action: 'store', target: '' } });
    form.content.en = { ...form.content.en!, primaryLabel: 'Update', secondaryLabel: 'Later' };
    const draft = draftFromForm(form, []);
    expect(draft.content.en).toEqual({ title: 'Hello', body: 'Body text', primaryLabel: 'Update' });
    expect(draft.primaryAction).toEqual({ type: 'store' });
    expect(draft.secondaryAction).toBeUndefined();
  });

  it('sets the banner position only for banners', () => {
    expect(draftFromForm(filled({ presentation: 'banner', bannerPosition: 'bottom' }), []).bannerPosition).toBe('bottom');
    expect(draftFromForm(filled({ presentation: 'sheet', bannerPosition: 'bottom' }), []).bannerPosition).toBeUndefined();
  });

  it('keeps unreadable numbers so validation can name them', () => {
    const issues = validateMessage(draftFromForm(filled({ maxShows: 'lots', priority: 'high' }), []));
    expect(issues.map((i) => i.field)).toEqual(expect.arrayContaining(['maxShows', 'priority']));
  });

  it('a clean form validates', () => {
    expect(formIssues(filled(), parseUsers(''))).toEqual([]);
  });
});

describe('form <-> message', () => {
  const message: AdminMessage = {
    id: 'm1',
    name: 'Update',
    status: 'live',
    presentation: 'banner',
    tone: 'warning',
    icon: 'cloud-download-outline',
    imageUrl: undefined,
    content: {
      en: { title: 'Update', body: 'Please', primaryLabel: 'Update' },
      he: { title: 'עדכון', body: 'בבקשה' },
      fr: { title: 'Mise à jour', body: '' },
    },
    primaryAction: { type: 'store' },
    secondaryAction: { type: 'link', url: 'https://x.test' },
    link: { url: 'https://x.test/more' },
    dismissible: true,
    required: false,
    frequency: { type: 'every_n_days', days: 4 },
    maxShows: 3,
    priority: 7,
    screens: ['/(tabs)/hub'],
    bannerPosition: 'bottom',
    delaySeconds: 2,
    startsAt: '2026-12-01T07:30:00.000Z',
    endsAt: null,
    targeting: { userIds: [ADMIN], plans: ['free'], platforms: ['android'], languages: ['en'], maxAppVersion: '2.0' },
    seenCount: 3,
    dismissedCount: 1,
    clickedCount: 0,
  };

  it('round-trips through the form', () => {
    const draft = draftFromForm(formFromMessage(message), [ADMIN]);
    expect(draft).toMatchObject({
      id: 'm1',
      name: 'Update',
      presentation: 'banner',
      tone: 'warning',
      icon: 'cloud-download-outline',
      primaryAction: { type: 'store' },
      secondaryAction: { type: 'link', url: 'https://x.test' },
      link: { url: 'https://x.test/more' },
      frequency: { type: 'every_n_days', days: 4 },
      maxShows: 3,
      priority: 7,
      screens: ['/(tabs)/hub'],
      bannerPosition: 'bottom',
      delaySeconds: 2,
      endsAt: null,
      targeting: message.targeting,
    });
    expect(new Date(draft.startsAt as string).getTime()).toBe(Date.parse(message.startsAt as string));
    // A language outside the five tabs is kept, not lost on edit.
    expect(draft.content.fr?.title).toBe('Mise à jour');
    expect(draft.content.he?.title).toBe('עדכון');
  });

  it('duplicate has no id and a new name', () => {
    const copy = duplicateForm(formFromMessage(message));
    expect(copy.id).toBeUndefined();
    expect(copy.name).toBe('Copy of Update');
    expect(draftFromForm(copy, []).id).toBeUndefined();
  });
});

describe('users', () => {
  it('splits ids, emails and the rest', () => {
    const parsed = parseUsers(`${ADMIN.toUpperCase()}, Ann@Example.com\n${ADMIN} nonsense;bob@x.io`);
    expect(parsed.ids).toEqual([ADMIN]);
    expect(parsed.emails).toEqual(['ann@example.com', 'bob@x.io']);
    expect(parsed.unknown).toEqual(['nonsense']);
  });

  it('resolves emails to ids and reports the ones nobody has', () => {
    const parsed = parseUsers(`${OTHER} ann@example.com ghost@example.com`);
    const result = resolveUsers(parsed, [
      { id: ADMIN, email: 'Ann@example.com' },
      { id: 'zzz', email: null },
    ]);
    expect(result.userIds.sort()).toEqual([ADMIN, OTHER].sort());
    expect(result.missing).toEqual(['ghost@example.com']);
  });

  it('formIssues names unknown tokens and missing emails beside the field', () => {
    const issues = formIssues(filled(), parseUsers('what'), ['ghost@example.com']);
    expect(issuesFor(issues, 'targeting.userIds')).toEqual([
      '“what” is not a user ID or an email.',
      'No user has the email ghost@example.com.',
    ]);
  });
});

describe('times', () => {
  it('parses local times and formats them back', () => {
    const iso = parseLocalTime('2026-03-05 07:08');
    expect(formatLocalTime(iso)).toBe('2026-03-05 07:08');
    expect(parseLocalTime('')).toBeNull();
  });

  it('gives an impossible date back as text, so validation names it', () => {
    expect(parseLocalTime('2026-02-31 10:00')).toBe('2026-02-31 10:00');
    const issues = formIssues(filled({ startsAt: 'tomorrow' }), parseUsers(''));
    expect(issuesFor(issues, 'startsAt')).toEqual(['The start time is not a date.']);
  });

  it('an end before the start is an error beside the end', () => {
    const issues = formIssues(filled({ startsAt: '2026-12-02 10:00', endsAt: '2026-12-01 10:00' }), parseUsers(''));
    expect(issuesFor(issues, 'endsAt')).toEqual(['The end must come after the start.']);
  });

  it('describes the window', () => {
    expect(describeWindow(null, null)).toBe('Always on, no end');
    expect(describeWindow('2026-12-01T10:00:00.000Z', null)).toMatch(/^From .*, no end$/);
    expect(describeWindow('2026-12-01T10:00:00.000Z', '2026-12-05T10:00:00.000Z')).toMatch(/ to /);
  });
});

describe('validation errors sit beside their field', () => {
  it('a required message with no leading button is flagged on the primary button', () => {
    const form = setRequired(filled(), true);
    const issues = formIssues(form, parseUsers(''));
    expect(issuesFor(issues, 'primaryAction')[0]).toMatch(/can't be dismissed/);
  });

  it('a button needs its English label', () => {
    const form = filled({ primary: { enabled: true, action: 'store', target: '' } });
    expect(issuesFor(formIssues(form, parseUsers('')), 'primaryAction')).toEqual(['A button needs an English label.']);
  });

  it('a link needs an https address and an English label', () => {
    const form = filled({ linkUrl: 'http://x.test' });
    expect(issuesFor(formIssues(form, parseUsers('')), 'link').length).toBeGreaterThan(0);
    const noLabel = filled({ linkUrl: 'https://x.test' });
    expect(issuesFor(formIssues(noLabel, parseUsers('')), 'link')).toEqual(['Give the link an English label.']);
  });

  it('a missing English title is reported on the English title, once', () => {
    const form = emptyForm();
    form.name = 'x';
    expect(issuesFor(formIssues(form, parseUsers('')), 'content.en.title')).toHaveLength(1);
  });

  it('a language with text but no title is reported on that language', () => {
    const form = filled();
    form.content.he = { ...form.content.he!, body: 'גוף' };
    expect(issuesFor(formIssues(form, parseUsers('')), 'content.he', true)).toHaveLength(1);
  });

  it('issuesFor can match a whole group of fields', () => {
    const issues = [
      { field: 'content.he.title', message: 'a' },
      { field: 'content.he.body', message: 'b' },
      { field: 'content.en.title', message: 'c' },
    ];
    expect(issuesFor(issues, 'content.he', true)).toEqual(['a', 'b']);
    expect(issuesFor(issues, 'content.he')).toEqual([]);
  });
});

describe('presets', () => {
  const checks = (form: MessageForm) => formIssues({ ...form, maxAppVersion: form.maxAppVersion || '2.0' }, parseUsers(''));

  it('announcement: a sheet shown once to everyone', () => {
    const form = applyPreset(emptyForm(), 'announcement');
    expect(form).toMatchObject({ presentation: 'sheet', frequency: 'once', dismissible: true, plans: [], platforms: [], users: '' });
  });

  it('update prompt below version: a banner with a store button on phones, version left to fill', () => {
    const form = applyPreset(emptyForm(), 'update-below');
    expect(form).toMatchObject({
      presentation: 'banner',
      primary: { enabled: true, action: 'store' },
      platforms: ['ios', 'android'],
      maxAppVersion: '',
    });
    expect(form.content.en?.primaryLabel).toBe('Update');
  });

  it('required update: full screen, required, store button', () => {
    const form = applyPreset(emptyForm(), 'required-update');
    expect(form).toMatchObject({ presentation: 'fullscreen', required: true, dismissible: false, primary: { action: 'store' } });
    expect(Number(form.priority)).toBeGreaterThan(0);
  });

  it('popup to one user: a sheet shown once', () => {
    expect(applyPreset(emptyForm(), 'one-user')).toMatchObject({ presentation: 'sheet', frequency: 'once' });
  });

  it('keeps what the admin typed and the preset passes validation once the title is there', () => {
    const typed = filled({ name: 'My name', imageUrl: 'https://x.test/a.png' });
    for (const id of ['announcement', 'update-below', 'required-update', 'one-user'] as const) {
      const form = applyPreset(typed, id);
      expect(form.name).toBe('My name');
      expect(form.content.en?.title).toBe('Hello');
      expect(form.imageUrl).toBe('https://x.test/a.png');
      expect(checks(form)).toEqual([]);
    }
  });

  it('switching presets clears the old preset’s targeting and buttons', () => {
    const update = applyPreset(emptyForm(), 'update-below');
    const next = applyPreset(update, 'announcement');
    expect(next.platforms).toEqual([]);
    expect(next.primary.enabled).toBe(false);
  });
});

describe('send to me only', () => {
  it('targets only the admin, with no window, as a new message', () => {
    const form = filled({
      id: 'existing',
      plans: ['pro'],
      languages: ['he'],
      users: OTHER,
      startsAt: '2026-12-01 09:00',
      endsAt: '2026-12-02 09:00',
    });
    const draft = testDraft(form, ADMIN.toUpperCase());
    expect(draft.id).toBeUndefined();
    expect(draft.targeting).toEqual({ userIds: [ADMIN] });
    expect(draft.startsAt).toBeNull();
    expect(draft.endsAt).toBeNull();
    expect(draft.name).toBe('Test: Spring news');
    expect(validateMessage(draft)).toEqual([]);
  });

  it('shows on every launch, so a copy seen on one device still reaches the others', () => {
    expect(testDraft(filled({ frequency: 'once' }), ADMIN).frequency).toEqual({ type: 'every_launch' });
  });

  it('keeps the name within the limit', () => {
    expect(testDraft(filled({ name: 'x'.repeat(120) }), ADMIN).name.length).toBe(120);
  });
});

describe('list actions', () => {
  it('stop for live and scheduled, start for draft and stopped, neither for ended', () => {
    expect(statusActions('live')).toEqual({ stop: true, start: false });
    expect(statusActions('scheduled')).toEqual({ stop: true, start: false });
    expect(statusActions('draft')).toEqual({ stop: false, start: true });
    expect(statusActions('stopped')).toEqual({ stop: false, start: true });
    expect(statusActions('ended')).toEqual({ stop: false, start: false });
  });

  it('splitScreens trims and removes duplicates', () => {
    expect(splitScreens(' /a ,/b\n\n/a')).toEqual(['/a', '/b']);
  });
});

describe('describeTargeting', () => {
  it('says everyone when nothing narrows it', () => {
    expect(describeTargeting({})).toBe('Everyone signed in');
  });

  it('lists what narrows it', () => {
    expect(
      describeTargeting({ userIds: [ADMIN], plans: ['pro'], platforms: ['ios', 'android'], languages: ['he'], maxAppVersion: '2.0' }),
    ).toBe('1 user · pro plan · ios + android · language he · below 2.0');
  });
});
