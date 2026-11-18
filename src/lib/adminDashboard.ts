/**
 * Types and pure helpers for the web admin dashboard (/admin/dashboard).
 * The numbers come from the admin_dashboard and admin_user_detail RPCs.
 */

export const DASHBOARD_RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
] as const;

export type DashboardWindow = {
  new_users: number;
  active_users: number;
  active_guests: number;
  recipes_saved: number;
  extractions: number;
  extraction_failures: number;
  ai_cost_usd: number;
  ai_cost_admin_usd: number;
  ai_cost_guest_usd: number;
  purchases: number;
  credits_sold: number;
  revenue_usd: number;
};

export type DashboardDay = {
  day: string;
  signups: number;
  recipes: number;
  extractions: number;
  failures: number;
  ai_cost_usd: number;
  active_users: number;
  revenue_usd: number;
};

export type RankedCount = { label: string; count: number };

export type DashboardPerson = {
  id: string;
  email: string | null;
  created_at: string;
  is_admin: boolean;
  token_balance: number;
  plan: string;
  recipes: number;
  window_recipes: number;
  extractions: number;
  failures: number;
  ai_cost_usd: number;
  window_ai_cost_usd: number;
  credits_bought: number;
  spent_usd: number;
  last_active_at: string | null;
  country: string | null;
  platform: string | null;
  /** Their onboarding "How did you hear about Pinch?" answer, if linked. */
  heard_about?: string | null;
  /** Raw source of their first website visit ('' = untagged visit, null = none linked). */
  web_source?: string | null;
};

export type DashboardRecipe = {
  id: string;
  title: string | null;
  platform: string | null;
  url: string | null;
  image_url: string | null;
  source: string | null;
  status: string | null;
  created_at: string;
  user_id: string;
  email: string | null;
};

export type DashboardFailure = {
  created_at: string;
  action: string;
  status: string;
  platform: string | null;
  source: string | null;
  message: string | null;
  user_id: string | null;
  email: string | null;
  guest: boolean;
};

export type DashboardPurchase = {
  created_at: string;
  user_id: string;
  email: string | null;
  product_id: string;
  provider: string;
  credits: number;
  usd: number;
};

/** Website visits from one raw source: a utm_source tag or a referring hostname ('' = none). */
export type TrafficRow = {
  source: string;
  visits: number;
  visitors: number;
  /** Visitors who tapped App Store, Google Play or "continue on the web". */
  clicked: number;
  guide_visits: number;
};

export type Dashboard = {
  range: {
    days: number;
    tz: string;
    since: string;
    previous_since: string;
    include_admins: boolean;
    generated_at: string;
  };
  kpis: { current: DashboardWindow; previous: DashboardWindow };
  totals: {
    users: number;
    recipes: number;
    ai_cost_usd: number;
    revenue_usd: number;
    credits_sold: number;
    paying_users: number;
  };
  daily: DashboardDay[];
  cost_by_action: {
    action: string;
    events: number;
    failed: number;
    cost_usd: number;
    scrape_cost_usd: number;
  }[];
  cost_by_model: { model: string; calls: number; cost_usd: number; tokens: number }[];
  scrape_cost_usd: number;
  recipes_by_platform: RankedCount[];
  recipes_by_source: RankedCount[];
  heard_about: RankedCount[];
  traffic: TrafficRow[];
  funnel: { signed_up: number; extracted: number; saved: number; saved_3: number; purchased: number };
  people: DashboardPerson[];
  recent_recipes: DashboardRecipe[];
  recent_failures: DashboardFailure[];
  purchases: DashboardPurchase[];
};

export type UserDetail = {
  profile: {
    id: string;
    email: string | null;
    created_at: string;
    is_admin: boolean;
    token_balance: number;
    plan: string;
    ai_cost_usd: number;
    extractions: number;
    failures: number;
    free_extracts_this_month: number;
  };
  recipes: {
    id: string;
    title: string | null;
    platform: string | null;
    url: string | null;
    image_url: string | null;
    source: string | null;
    status: string | null;
    created_at: string;
    is_favorite: boolean | null;
    last_cooked_at: string | null;
    ingredients: number;
    minutes: number | null;
    calories: number | null;
  }[];
  ai_events: {
    created_at: string;
    action: string;
    status: string;
    platform: string | null;
    source: string | null;
    cost_usd: number;
    duration_ms: number | null;
    message: string | null;
  }[];
  events: { created_at: string; name: string; properties: Record<string, unknown>; country: string | null }[];
  purchases: {
    created_at: string;
    product_id: string;
    provider: string;
    credits: number;
    revoked_at: string | null;
  }[];
  ledger: { created_at: string; delta: number; balance_after: number; reason: string }[];
};

/** Postgres numerics arrive as numbers or strings depending on size; make them numbers. */
export function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** "1 recipe", "3 recipes". */
export function plural(count: number, one: string, many = `${one}s`): string {
  const n = num(count);
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

export function formatCount(value: number): string {
  const n = num(value);
  if (Math.abs(n) >= 10_000) return new Intl.NumberFormat('en', { notation: 'compact' }).format(n);
  return new Intl.NumberFormat('en').format(n);
}

/** Dollars: cents for normal amounts, more digits for the sub-cent AI costs. */
export function formatUsd(value: number, { precise = false } = {}): string {
  const n = num(value);
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  const digits = precise || abs < 0.1 ? (abs < 0.01 ? 4 : 3) : 2;
  return `${n < 0 ? '-' : ''}$${abs.toFixed(digits)}`;
}

export function formatPercent(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((num(part) / num(whole)) * 100)}%`;
}

export type Delta = { direction: 'up' | 'down' | 'flat' | 'new'; text: string };

/** Change from the previous window to this one, as shown under a stat tile. */
export function deltaOf(current: number, previous: number): Delta {
  const now = num(current);
  const before = num(previous);
  if (now === before) return { direction: 'flat', text: 'same as before' };
  if (before === 0) return { direction: 'new', text: `up from 0` };
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  if (pct === 0) return { direction: now > before ? 'up' : 'down', text: 'about the same' };
  return pct > 0
    ? { direction: 'up', text: `+${pct}% vs before` }
    : { direction: 'down', text: `${pct}% vs before` };
}

/** "up 26% from", "down 10% from", "unchanged from", "up from 0 in". */
export function changeWords(current: number, previous: number): string {
  const now = num(current);
  const before = num(previous);
  if (now === before) return 'unchanged from';
  if (before === 0) return 'up from nothing in';
  const pct = Math.abs(Math.round(((now - before) / Math.abs(before)) * 100));
  return `${now > before ? 'up' : 'down'} ${pct}% from`;
}

export function relativeTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'never';
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (Number.isNaN(seconds)) return '—';
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

/** "2026-11-17" → "Nov 17", read as a calendar day (no timezone shift). */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

export function humanize(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const text = value.replaceAll('_', ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const FEATURE_NAMES: Record<string, string> = {
  extract: 'Recipe extraction',
  extract_gate: 'Extraction route check (Jev gate)',
  content_gate: 'Food check',
  translate: 'Translation',
  remix: 'Remix',
  invent: 'Invent a recipe',
  substitution: 'Ingredient swaps',
  fridge_match: 'Fridge match',
  hub_diets: 'Hub diet tags',
  recipe_edit_check: 'Edit check',
  recipe_edit_recalc: 'Edit recalculation',
  appliances_backfill: 'Appliance backfill',
  repair: 'Recipe repair',
};

/** What an ai_usage_events action is, in words. */
export function featureName(action: string): string {
  return FEATURE_NAMES[action] ?? humanize(action);
}

export function deviceName(platform: string | null | undefined): string {
  if (!platform) return '—';
  const key = platform.toLowerCase();
  if (key === 'ios') return 'iPhone';
  if (key === 'android') return 'Android';
  if (key === 'web') return 'Web';
  return humanize(platform);
}

/** "openai/gpt-6-luna" → "gpt-6-luna". */
export function modelName(model: string): string {
  const slash = model.lastIndexOf('/');
  return slash >= 0 ? model.slice(slash + 1) : model;
}

export function countryName(code: string | null | undefined): string {
  const normalized = code?.trim().toUpperCase() ?? '';
  if (!/^[A-Z]{2}$/.test(normalized)) return '—';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}

export function rangeLabel(days: number): string {
  if (days === 365) return 'the last 12 months';
  if (days === 1) return 'today';
  return `the last ${days} days`;
}

export type Highlight = { tone: 'good' | 'bad' | 'neutral'; text: string };

/**
 * Plain-English sentences for the top of the overview: what changed and what
 * deserves a look. Order: growth, activation, spend, money, problems.
 */
export function buildHighlights(data: Dashboard): Highlight[] {
  const now = data.kpis.current;
  const before = data.kpis.previous;
  const period = rangeLabel(data.range.days);
  const out: Highlight[] = [];

  const newUsers = num(now.new_users);
  const prevUsers = num(before.new_users);
  if (newUsers === 0) {
    out.push({ tone: 'bad', text: `Nobody signed up in ${period}.` });
  } else {
    const change = deltaOf(newUsers, prevUsers);
    const tail =
      change.direction === 'flat'
        ? ', the same as the period before'
        : change.direction === 'new'
          ? ', up from none the period before'
          : `, ${change.direction === 'up' ? 'up' : 'down'} from ${prevUsers} the period before`;
    out.push({
      tone: newUsers >= prevUsers ? 'good' : 'bad',
      text: `${newUsers} ${newUsers === 1 ? 'person' : 'people'} signed up in ${period}${tail}.`,
    });
  }

  const funnel = data.funnel;
  if (num(funnel.signed_up) > 0) {
    out.push({
      tone: num(funnel.extracted) / num(funnel.signed_up) >= 0.5 ? 'good' : 'neutral',
      text: `${funnel.extracted} of them (${formatPercent(funnel.extracted, funnel.signed_up)}) extracted a recipe and ${funnel.saved} saved one. ${funnel.saved_3} saved 3 or more.`,
    });
  }

  const recipes = num(now.recipes_saved);
  out.push({
    tone: 'neutral',
    text: `${num(now.active_users)} signed-in people and ${num(now.active_guests)} guests were active. They saved ${recipes} ${recipes === 1 ? 'recipe' : 'recipes'}.`,
  });

  const cost = num(now.ai_cost_usd);
  const extractions = num(now.extractions);
  const perExtract = extractions ? ` (${formatUsd(cost / extractions, { precise: true })} per extraction)` : '';
  const admin = num(now.ai_cost_admin_usd);
  const adminNote = admin > 0 ? ` ${formatUsd(admin)} of it was from admin accounts.` : '';
  out.push({
    tone: 'neutral',
    text: `AI cost ${formatUsd(cost)}${perExtract}, ${changeWords(cost, num(before.ai_cost_usd))} the period before.${adminNote}`,
  });

  const revenue = num(now.revenue_usd);
  if (num(now.purchases) === 0) {
    out.push({ tone: 'neutral', text: `No credit packs sold in ${period}.` });
  } else {
    out.push({
      tone: revenue >= cost ? 'good' : 'neutral',
      text: `${now.purchases} credit ${num(now.purchases) === 1 ? 'pack' : 'packs'} sold for about ${formatUsd(revenue)} (${formatCount(now.credits_sold)} credits).`,
    });
  }

  const traffic = summarizeTraffic(data.traffic ?? []);
  if (traffic.aiVisits > 0) {
    const names = traffic.ai.map((s) => `${s.label} ${s.visits}`).join(', ');
    out.push({
      tone: 'good',
      text: `${traffic.aiVisits} website ${traffic.aiVisits === 1 ? 'visit' : 'visits'} came from AI assistants (${names}), ${formatPercent(traffic.aiVisits, traffic.totalVisits)} of all visits.`,
    });
  }

  const failures = num(now.extraction_failures);
  const attempts = failures + extractions;
  if (failures > 0) {
    const rate = failures / attempts;
    out.push({
      tone: rate > 0.15 ? 'bad' : 'neutral',
      text: `${failures} ${failures === 1 ? 'extraction' : 'extractions'} failed, ${formatPercent(failures, attempts)} of attempts.`,
    });
  }

  return out;
}

export type PersonSort =
  | 'created_at'
  | 'last_active_at'
  | 'recipes'
  | 'extractions'
  | 'ai_cost_usd'
  | 'spent_usd';

export function sortPeople(people: DashboardPerson[], key: PersonSort): DashboardPerson[] {
  return [...people].sort((a, b) => {
    if (key === 'created_at' || key === 'last_active_at') {
      return (b[key] ?? '').localeCompare(a[key] ?? '');
    }
    return num(b[key]) - num(a[key]);
  });
}

export type TrafficGroup =
  | 'AI assistants'
  | 'Search'
  | 'Social'
  | 'Shared from the app'
  | 'Other sites'
  | 'Direct or unknown';

// First match wins, so Gemini is checked before Google.
const TRAFFIC_RULES: { test: RegExp; label: string; group: TrafficGroup }[] = [
  { test: /chatgpt|openai/, label: 'ChatGPT', group: 'AI assistants' },
  { test: /gemini|bard\.google/, label: 'Gemini', group: 'AI assistants' },
  { test: /perplexity/, label: 'Perplexity', group: 'AI assistants' },
  { test: /claude|anthropic/, label: 'Claude', group: 'AI assistants' },
  { test: /copilot/, label: 'Copilot', group: 'AI assistants' },
  { test: /meta\.ai/, label: 'Meta AI', group: 'AI assistants' },
  { test: /grok/, label: 'Grok', group: 'AI assistants' },
  { test: /deepseek/, label: 'DeepSeek', group: 'AI assistants' },
  { test: /mistral/, label: 'Le Chat (Mistral)', group: 'AI assistants' },
  { test: /^you\.com$/, label: 'You.com', group: 'AI assistants' },
  { test: /pinch_app/, label: 'Shared from the Pinch app', group: 'Shared from the app' },
  { test: /google/, label: 'Google', group: 'Search' },
  { test: /bing/, label: 'Bing', group: 'Search' },
  { test: /duckduckgo/, label: 'DuckDuckGo', group: 'Search' },
  { test: /yahoo/, label: 'Yahoo', group: 'Search' },
  { test: /yandex/, label: 'Yandex', group: 'Search' },
  { test: /ecosia/, label: 'Ecosia', group: 'Search' },
  { test: /search\.brave/, label: 'Brave Search', group: 'Search' },
  { test: /instagram/, label: 'Instagram', group: 'Social' },
  { test: /tiktok/, label: 'TikTok', group: 'Social' },
  { test: /facebook|^fb\./, label: 'Facebook', group: 'Social' },
  { test: /youtube|youtu\.be/, label: 'YouTube', group: 'Social' },
  { test: /^t\.co$|^x\.com$|twitter/, label: 'X (Twitter)', group: 'Social' },
  { test: /reddit/, label: 'Reddit', group: 'Social' },
  { test: /pinterest/, label: 'Pinterest', group: 'Social' },
  { test: /whatsapp/, label: 'WhatsApp', group: 'Social' },
  { test: /threads/, label: 'Threads', group: 'Social' },
  { test: /linkedin|lnkd\.in/, label: 'LinkedIn', group: 'Social' },
];

/** Name and group for a raw traffic source. */
export function classifySource(raw: string | null | undefined): { label: string; group: TrafficGroup } {
  const source = (raw ?? '').trim().toLowerCase();
  if (!source) return { label: 'Direct or unknown', group: 'Direct or unknown' };
  const rule = TRAFFIC_RULES.find((r) => r.test.test(source));
  if (rule) return { label: rule.label, group: rule.group };
  return { label: source.replace(/^www\./, ''), group: 'Other sites' };
}

const HEARD_ABOUT_NAMES: Record<string, string> = {
  tiktok_instagram: 'TikTok or Instagram',
  friend: 'A friend',
  app_store: 'App Store or Google Play',
  google: 'Google search',
  ai_assistant: 'An AI assistant',
  other: 'Something else',
};

/** An onboarding "How did you hear about Pinch?" answer, in words. */
export function heardAboutName(source: string | null | undefined): string {
  if (!source) return 'Not known';
  return HEARD_ABOUT_NAMES[source] ?? humanize(source);
}

export type PersonSource = {
  /** Main label: what they told us, else the site that sent them, else "Not known". */
  label: string;
  /** Supporting detail, such as the website source behind their answer. */
  detail: string | null;
  known: boolean;
};

/** Where one person came from, for the People table. */
export function personSource(person: Pick<DashboardPerson, 'heard_about' | 'web_source'>): PersonSource {
  const web = person.web_source == null ? null : classifySource(person.web_source).label;
  if (person.heard_about) {
    return { label: heardAboutName(person.heard_about), detail: web ? `Website: ${web}` : null, known: true };
  }
  if (web) return { label: web, detail: 'Website visit, no answer', known: true };
  return { label: 'Not known', detail: null, known: false };
}

export type SourceStats = {
  label: string;
  people: number;
  extracted: number;
  saved: number;
  paid: number;
};

export type SignupSources = {
  total: number;
  /** People with an answer or a linked website visit. */
  known: number;
  /** By onboarding answer ("Not known" last). */
  heard: SourceStats[];
  /** By the site of their first website visit, for people linked to one. */
  web: SourceStats[];
};

/** New people grouped by where they came from, with how far each group got. */
export function summarizeSignupSources(people: DashboardPerson[]): SignupSources {
  const heard = new Map<string, SourceStats>();
  const web = new Map<string, SourceStats>();
  const add = (map: Map<string, SourceStats>, label: string, p: DashboardPerson) => {
    const row = map.get(label) ?? { label, people: 0, extracted: 0, saved: 0, paid: 0 };
    row.people += 1;
    if (num(p.extractions) > 0) row.extracted += 1;
    if (num(p.recipes) > 0) row.saved += 1;
    if (num(p.credits_bought) > 0) row.paid += 1;
    map.set(label, row);
  };
  let known = 0;
  for (const p of people) {
    add(heard, heardAboutName(p.heard_about), p);
    if (p.web_source != null) add(web, classifySource(p.web_source).label, p);
    if (personSource(p).known) known += 1;
  }
  const order = (a: SourceStats, b: SourceStats) =>
    Number(a.label === 'Not known') - Number(b.label === 'Not known') || b.people - a.people || a.label.localeCompare(b.label);
  return {
    total: people.length,
    known,
    heard: [...heard.values()].sort(order),
    web: [...web.values()].sort(order),
  };
}

export type TrafficSource = {
  label: string;
  group: TrafficGroup;
  visits: number;
  visitors: number;
  clicked: number;
};

export type TrafficSummary = {
  totalVisits: number;
  sources: TrafficSource[];
  groups: { label: TrafficGroup; visits: number; visitors: number }[];
  ai: TrafficSource[];
  aiVisits: number;
};

/** Merges raw sources into named ones (chatgpt.com and chat.openai.com both become "ChatGPT") and groups. */
export function summarizeTraffic(rows: TrafficRow[]): TrafficSummary {
  const byLabel = new Map<string, TrafficSource>();
  for (const row of rows) {
    const { label, group } = classifySource(row.source);
    const current = byLabel.get(label) ?? { label, group, visits: 0, visitors: 0, clicked: 0 };
    current.visits += num(row.visits);
    current.visitors += num(row.visitors);
    current.clicked += num(row.clicked);
    byLabel.set(label, current);
  }
  const sources = [...byLabel.values()].sort((a, b) => b.visits - a.visits || a.label.localeCompare(b.label));
  const groupMap = new Map<TrafficGroup, { label: TrafficGroup; visits: number; visitors: number }>();
  for (const source of sources) {
    const group = groupMap.get(source.group) ?? { label: source.group, visits: 0, visitors: 0 };
    group.visits += source.visits;
    group.visitors += source.visitors;
    groupMap.set(source.group, group);
  }
  const ai = sources.filter((s) => s.group === 'AI assistants');
  return {
    totalVisits: sources.reduce((sum, s) => sum + s.visits, 0),
    sources,
    groups: [...groupMap.values()].sort((a, b) => b.visits - a.visits),
    ai,
    aiVisits: ai.reduce((sum, s) => sum + s.visits, 0),
  };
}
