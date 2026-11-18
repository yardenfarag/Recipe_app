import { describe, expect, it } from 'vitest';

import {
  buildHighlights,
  changeWords,
  classifySource,
  summarizeTraffic,
  deltaOf,
  featureName,
  formatUsd,
  heardAboutName,
  modelName,
  personSource,
  sortPeople,
  summarizeSignupSources,
  type Dashboard,
  type DashboardPerson,
  type DashboardWindow,
} from './adminDashboard';

function windowOf(overrides: Partial<DashboardWindow> = {}): DashboardWindow {
  return {
    new_users: 0,
    active_users: 0,
    active_guests: 0,
    recipes_saved: 0,
    extractions: 0,
    extraction_failures: 0,
    ai_cost_usd: 0,
    ai_cost_admin_usd: 0,
    ai_cost_guest_usd: 0,
    purchases: 0,
    credits_sold: 0,
    revenue_usd: 0,
    ...overrides,
  };
}

function dashboard(current: Partial<DashboardWindow>, previous: Partial<DashboardWindow>, funnel?: Partial<Dashboard['funnel']>): Dashboard {
  return {
    range: { days: 30, tz: 'UTC', since: '', previous_since: '', include_admins: false, generated_at: '' },
    kpis: { current: windowOf(current), previous: windowOf(previous) },
    totals: { users: 0, recipes: 0, ai_cost_usd: 0, revenue_usd: 0, credits_sold: 0, paying_users: 0 },
    daily: [],
    cost_by_action: [],
    cost_by_model: [],
    scrape_cost_usd: 0,
    recipes_by_platform: [],
    recipes_by_source: [],
    heard_about: [],
    traffic: [],
    funnel: { signed_up: 0, extracted: 0, saved: 0, saved_3: 0, purchased: 0, ...funnel },
    people: [],
    recent_recipes: [],
    recent_failures: [],
    purchases: [],
  };
}

describe('deltaOf', () => {
  it('describes growth, decline and no change', () => {
    expect(deltaOf(24, 19)).toEqual({ direction: 'up', text: '+26% vs before' });
    expect(deltaOf(5, 10)).toEqual({ direction: 'down', text: '-50% vs before' });
    expect(deltaOf(3, 3).direction).toBe('flat');
    expect(deltaOf(3, 0).direction).toBe('new');
  });

  it('keeps the sign right when the previous value was negative', () => {
    expect(deltaOf(-1, -2).direction).toBe('up');
    expect(deltaOf(-1, -2).text).toBe('+50% vs before');
  });

  it('accepts numeric strings from Postgres', () => {
    expect(deltaOf('4' as unknown as number, '2' as unknown as number).text).toBe('+100% vs before');
  });
});

describe('changeWords', () => {
  it('reads as a sentence fragment', () => {
    expect(changeWords(0.85, 0.35)).toBe('up 143% from');
    expect(changeWords(1, 2)).toBe('down 50% from');
    expect(changeWords(1, 1)).toBe('unchanged from');
    expect(changeWords(1, 0)).toBe('up from nothing in');
  });
});

describe('formatUsd', () => {
  it('shows more digits for tiny AI costs', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(7.99)).toBe('$7.99');
    expect(formatUsd(0.0213)).toBe('$0.021');
    expect(formatUsd(0.00467)).toBe('$0.0047');
    expect(formatUsd(-1.5)).toBe('-$1.50');
  });
});

describe('names', () => {
  it('turns ids into words', () => {
    expect(modelName('openai/gpt-6-luna')).toBe('gpt-6-luna');
    expect(featureName('extract')).toBe('Recipe extraction');
    expect(featureName('brand_new_thing')).toBe('Brand new thing');
  });
});

describe('buildHighlights', () => {
  it('summarises growth, activation, cost, sales and failures', () => {
    const lines = buildHighlights(
      dashboard(
        { new_users: 24, active_users: 27, active_guests: 514, recipes_saved: 31, extractions: 40, extraction_failures: 8, ai_cost_usd: 0.85, ai_cost_admin_usd: 0.14 },
        { new_users: 19, ai_cost_usd: 0.35 },
        { signed_up: 24, extracted: 14, saved: 11, saved_3: 1 },
      ),
    ).map((h) => h.text);

    expect(lines[0]).toBe('24 people signed up in the last 30 days, up from 19 the period before.');
    expect(lines[1]).toBe('14 of them (58%) extracted a recipe and 11 saved one. 1 saved 3 or more.');
    expect(lines[2]).toBe('27 signed-in people and 514 guests were active. They saved 31 recipes.');
    expect(lines[3]).toBe('AI cost $0.85 ($0.021 per extraction), up 143% from the period before. $0.14 of it was from admin accounts.');
    expect(lines[4]).toBe('No credit packs sold in the last 30 days.');
    expect(lines[5]).toBe('8 extractions failed, 17% of attempts.');
  });

  it('flags a period with no sign-ups', () => {
    const [first] = buildHighlights(dashboard({}, { new_users: 3 }));
    expect(first).toEqual({ tone: 'bad', text: 'Nobody signed up in the last 30 days.' });
  });
});

const person = (id: string, overrides: Partial<DashboardPerson>): DashboardPerson => ({
  id,
  email: `${id}@x.test`,
  created_at: '2026-11-01T00:00:00Z',
  is_admin: false,
  token_balance: 0,
  plan: 'free',
  recipes: 0,
  window_recipes: 0,
  extractions: 0,
  failures: 0,
  ai_cost_usd: 0,
  window_ai_cost_usd: 0,
  credits_bought: 0,
  spent_usd: 0,
  last_active_at: null,
  country: null,
  platform: null,
  ...overrides,
});

describe('sortPeople', () => {
  it('sorts numbers high to low and dates newest first, nulls last', () => {
    const people = [
      person('a', { recipes: 2, last_active_at: null }),
      person('b', { recipes: 9, last_active_at: '2026-11-10T00:00:00Z' }),
      person('c', { recipes: 5, last_active_at: '2026-11-12T00:00:00Z' }),
    ];
    expect(sortPeople(people, 'recipes').map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(sortPeople(people, 'last_active_at').map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('traffic sources', () => {
  it('names AI assistants, search, social and app shares', () => {
    expect(classifySource('chatgpt.com')).toEqual({ label: 'ChatGPT', group: 'AI assistants' });
    expect(classifySource('gemini.google.com')).toEqual({ label: 'Gemini', group: 'AI assistants' });
    expect(classifySource('www.perplexity.ai')).toEqual({ label: 'Perplexity', group: 'AI assistants' });
    expect(classifySource('claude.ai').label).toBe('Claude');
    expect(classifySource('copilot.microsoft.com').label).toBe('Copilot');
    expect(classifySource('google.com')).toEqual({ label: 'Google', group: 'Search' });
    expect(classifySource('l.instagram.com').group).toBe('Social');
    expect(classifySource('t.co').label).toBe('X (Twitter)');
    expect(classifySource('pinch_app').group).toBe('Shared from the app');
    expect(classifySource('')).toEqual({ label: 'Direct or unknown', group: 'Direct or unknown' });
    expect(classifySource('www.someblog.net')).toEqual({ label: 'someblog.net', group: 'Other sites' });
  });

  it('merges raw sources with the same name and totals the groups', () => {
    const summary = summarizeTraffic([
      { source: '', visits: 700, visitors: 500, clicked: 30, guide_visits: 0 },
      { source: 'chatgpt.com', visits: 25, visitors: 20, clicked: 4, guide_visits: 3 },
      { source: 'chat.openai.com', visits: 2, visitors: 2, clicked: 0, guide_visits: 0 },
      { source: 'gemini.google.com', visits: 3, visitors: 3, clicked: 1, guide_visits: 1 },
      { source: 'google.com', visits: 10, visitors: 9, clicked: 1, guide_visits: 5 },
    ]);
    expect(summary.totalVisits).toBe(740);
    expect(summary.aiVisits).toBe(30);
    expect(summary.ai.map((s) => [s.label, s.visits])).toEqual([
      ['ChatGPT', 27],
      ['Gemini', 3],
    ]);
    expect(summary.groups.map((g) => g.label)).toEqual(['Direct or unknown', 'AI assistants', 'Search']);
  });

  it('adds an AI line to the highlights', () => {
    const data = dashboard({}, {});
    data.traffic = [
      { source: 'chatgpt.com', visits: 25, visitors: 20, clicked: 4, guide_visits: 0 },
      { source: '', visits: 75, visitors: 60, clicked: 2, guide_visits: 0 },
    ];
    expect(buildHighlights(data).map((h) => h.text)).toContain(
      '25 website visits came from AI assistants (ChatGPT 25), 25% of all visits.',
    );
  });
});

describe('personSource', () => {
  it('prefers the onboarding answer and adds the website source as detail', () => {
    expect(personSource({ heard_about: 'ai_assistant', web_source: 'chatgpt.com' })).toEqual({
      label: 'An AI assistant',
      detail: 'Website: ChatGPT',
      known: true,
    });
  });

  it('falls back to the website source, and says when nothing is known', () => {
    expect(personSource({ heard_about: null, web_source: 'google.com' }).label).toBe('Google');
    expect(personSource({ heard_about: null, web_source: '' }).label).toBe('Direct or unknown');
    expect(personSource({ heard_about: null, web_source: null })).toEqual({ label: 'Not known', detail: null, known: false });
    expect(personSource({}).known).toBe(false);
  });

  it('names unexpected answers instead of dropping them', () => {
    expect(heardAboutName('podcast_ad')).toBe('Podcast ad');
  });
});

describe('summarizeSignupSources', () => {
  it('groups new people by answer and website, with how far each group got', () => {
    const summary = summarizeSignupSources([
      person('a', { heard_about: 'tiktok_instagram', extractions: 2, recipes: 1 }),
      person('b', { heard_about: 'tiktok_instagram', credits_bought: 10, extractions: 1 }),
      person('c', { heard_about: null, web_source: 'chatgpt.com' }),
      person('d', {}),
      person('e', {}),
      person('f', { heard_about: 'friend' }),
    ]);
    expect(summary.total).toBe(6);
    expect(summary.known).toBe(4);
    expect(summary.heard).toEqual([
      { label: 'TikTok or Instagram', people: 2, extracted: 2, saved: 1, paid: 1 },
      { label: 'A friend', people: 1, extracted: 0, saved: 0, paid: 0 },
      { label: 'Not known', people: 3, extracted: 0, saved: 0, paid: 0 },
    ]);
    expect(summary.web).toEqual([{ label: 'ChatGPT', people: 1, extracted: 0, saved: 0, paid: 0 }]);
  });
});
