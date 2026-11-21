/**
 * In-app messages: the types an admin writes and the app shows, and the rules
 * for picking what to show. Pure on purpose (no Supabase, no React Native), so
 * the admin screen, the app and the tests share one set of rules. The server
 * applies the same targeting and limits in
 * supabase/migrations/20261116120000_in_app_messages.sql; keep them in step.
 */

export type Presentation = 'alert' | 'sheet' | 'banner' | 'fullscreen';
export type Tone = 'info' | 'success' | 'warning' | 'critical';
export type MessagePlatform = 'ios' | 'android' | 'web';

export type ButtonAction =
  | { type: 'dismiss' }
  | { type: 'link'; url: string } // web address, in-app browser
  | { type: 'route'; href: string } // app route
  | { type: 'store' }; // App Store / Play Store

export type MessageButton = {
  label: string;
  action: ButtonAction;
  style?: 'primary' | 'secondary' | 'destructive';
};

export type LocalizedContent = {
  title: string;
  body: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  linkLabel?: string;
};

export type Frequency =
  | { type: 'once' }
  | { type: 'every_launch' }
  | { type: 'every_n_days'; days: number }
  | { type: 'until_dismissed' };

export type Targeting = {
  userIds?: string[];
  plans?: ('free' | 'pro')[];
  platforms?: MessagePlatform[];
  languages?: string[];
  minAppVersion?: string;
  /** Exclusive: "below X" is `maxAppVersion: 'X'`. */
  maxAppVersion?: string;
};

export type InAppMessage = {
  id: string;
  presentation: Presentation;
  tone: Tone;
  icon?: string;
  imageUrl?: string;
  /** Keyed by language; 'en' is required. */
  content: Record<string, LocalizedContent>;
  primaryAction?: ButtonAction;
  secondaryAction?: ButtonAction;
  link?: { url: string };
  dismissible: boolean;
  required: boolean;
  frequency: Frequency;
  maxShows?: number;
  priority: number;
  /** Route patterns; empty or missing means anywhere. */
  screens?: string[];
  bannerPosition?: 'top' | 'bottom';
  delaySeconds?: number;
};

export type MessageStatus = 'draft' | 'scheduled' | 'live' | 'stopped' | 'ended';

export type AdminMessage = InAppMessage & {
  name: string;
  status: MessageStatus;
  startsAt: string | null;
  endsAt: string | null;
  targeting: Targeting;
  seenCount: number;
  dismissedCount: number;
  clickedCount: number;
};

/** What an admin saves: an AdminMessage without the server-side parts. */
export type AdminMessageDraft = Omit<
  AdminMessage,
  'id' | 'status' | 'seenCount' | 'dismissedCount' | 'clickedCount'
> & { id?: string };

export type MessageEvent = 'seen' | 'dismissed' | 'clicked';
export type ClickedButton = 'primary' | 'secondary' | 'link';

/** The caller's own record for one message. */
export type MessageReceipt = {
  messageId: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  seenCount: number;
  dismissedAt: string | null;
  clickedAt: string | null;
  clickedButton: ClickedButton | null;
};

export type MessageIssue = { field: string; message: string };

/** Same limits as the table's check constraints. */
export const MESSAGE_LIMITS = {
  name: 120,
  title: 120,
  body: 1500,
  label: 40,
  languages: 12,
  userIds: 500,
  screens: 20,
  screenPattern: 120,
  url: 2000,
  href: 200,
  maxShows: 1000,
  priority: 1000,
  delaySeconds: 3600,
  everyNDays: 365,
} as const;

export const PRESENTATIONS: readonly Presentation[] = ['alert', 'sheet', 'banner', 'fullscreen'];
export const TONES: readonly Tone[] = ['info', 'success', 'warning', 'critical'];

// ---------------------------------------------------------------------------
// Language

/** "he-IL" and "he_IL" are "he"; the old code "iw" is "he". */
export function normalizeLanguage(language: string | null | undefined): string {
  const base = (language ?? '').trim().toLowerCase().replace(/_/g, '-').split('-')[0] ?? '';
  if (base === 'iw') return 'he';
  return base || 'en';
}

function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The language a message will actually be shown in: the user's language when
 * the message has content for it (a title at least), otherwise English,
 * otherwise whichever language it has. The app sets right-to-left from this
 * (he, ar), so Hebrew content reads right-to-left and the English fallback
 * left-to-right.
 */
export function resolveContentLanguage(
  message: Pick<InAppMessage, 'content'>,
  language: string | null | undefined,
): string {
  const wanted = normalizeLanguage(language);
  if (hasText(message.content[wanted]?.title)) return wanted;
  if (hasText(message.content.en?.title)) return 'en';
  const first = Object.keys(message.content).find((key) => hasText(message.content[key]?.title));
  return first ?? 'en';
}

/**
 * The text to show. A language missing or without a title falls back to
 * English as a whole; button and link labels missing in a language that is
 * otherwise there fall back to the English label.
 */
export function pickContent(
  message: Pick<InAppMessage, 'content'>,
  language: string | null | undefined,
): LocalizedContent {
  const resolved = resolveContentLanguage(message, language);
  const chosen = message.content[resolved];
  const english = message.content.en;
  const base: LocalizedContent = chosen ?? english ?? { title: '', body: '' };
  if (resolved === 'en' || !english) return { ...base };
  const result: LocalizedContent = { title: base.title, body: base.body };
  const primaryLabel = hasText(base.primaryLabel) ? base.primaryLabel : english.primaryLabel;
  const secondaryLabel = hasText(base.secondaryLabel) ? base.secondaryLabel : english.secondaryLabel;
  const linkLabel = hasText(base.linkLabel) ? base.linkLabel : english.linkLabel;
  if (hasText(primaryLabel)) result.primaryLabel = primaryLabel;
  if (hasText(secondaryLabel)) result.secondaryLabel = secondaryLabel;
  if (hasText(linkLabel)) result.linkLabel = linkLabel;
  return result;
}

/**
 * The (up to two) buttons in the user's language, primary first. A button
 * whose action is set but has no label in any language is left out.
 */
export function messageButtons(
  message: Pick<InAppMessage, 'content' | 'primaryAction' | 'secondaryAction'>,
  language: string | null | undefined,
): MessageButton[] {
  const content = pickContent(message, language);
  const buttons: MessageButton[] = [];
  if (message.primaryAction && hasText(content.primaryLabel)) {
    buttons.push({ label: content.primaryLabel, action: message.primaryAction, style: 'primary' });
  }
  if (message.secondaryAction && hasText(content.secondaryLabel)) {
    buttons.push({ label: content.secondaryLabel, action: message.secondaryAction, style: 'secondary' });
  }
  return buttons;
}

// ---------------------------------------------------------------------------
// App versions

/** "1.0.9" -> [1, 0, 9]. A suffix after "-" or "+" ("1.0.9-dev") is ignored. Null when unreadable. */
export function parseVersion(version: string | null | undefined): number[] | null {
  const base = (version ?? '').trim().split(/[-+]/)[0] ?? '';
  if (!/^\d{1,9}(\.\d{1,9}){0,3}$/.test(base)) return null;
  return base.split('.').map(Number);
}

/**
 * -1, 0 or 1, part by part, so "1.0.10" is above "1.0.9" and "1.0.9-dev"
 * equals "1.0.9". Missing parts count as 0 ("2" equals "2.0.0"). A version
 * that can't be read counts as "0".
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a) ?? [0];
  const pb = parseVersion(b) ?? [0];
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Screens

/** Drops the query, the "(group)" segments and a trailing slash: "/(tabs)/hub/?a=1" -> "/hub". */
function normalizeRoute(route: string): string[] {
  const path = route.split(/[?#]/)[0] ?? '';
  return path.split('/').filter((segment) => segment !== '' && !/^\(.*\)$/.test(segment));
}

function segmentsMatch(pattern: string[], route: string[]): boolean {
  for (let i = 0; i < pattern.length; i += 1) {
    const part = pattern[i] as string;
    if (part === '*' || /^\[\.\.\..+\]$/.test(part)) return route.length >= i; // the rest, any depth
    if (i >= route.length) return false;
    if (/^\[.+\]$/.test(part)) continue; // one dynamic segment
    if (part !== route[i]) return false;
  }
  return pattern.length === route.length;
}

/**
 * Does a message allowed on `screens` show on `route`? No screens (or an empty
 * list) means anywhere. Patterns are route patterns as the interaction log
 * writes them ("/(tabs)/hub", "/recipe/[id]"), compared without "(group)"
 * segments; "[id]" matches one segment, "*" or "[...rest]" the rest of the path.
 */
export function matchesScreen(screens: readonly string[] | undefined, route: string | null | undefined): boolean {
  if (!screens || screens.length === 0) return true;
  if (!route) return false;
  const target = normalizeRoute(route);
  return screens.some((pattern) => segmentsMatch(normalizeRoute(pattern), target));
}

// ---------------------------------------------------------------------------
// Choosing what to show

/** A required message can't be dismissed, whatever `dismissible` says. */
export function isDismissible(message: Pick<InAppMessage, 'dismissible' | 'required'>): boolean {
  return message.dismissible && !message.required;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MODULE_LOADED_AT = Date.now();

export type NextMessageOptions = {
  /**
   * When this app launch began, for the "every launch" rule: a message last
   * seen before this is due again. Defaults to when this module loaded, which
   * is the start of the launch.
   */
  launchedAt?: Date | number;
};

function toMillis(value: Date | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Is this message due, given what this user has already done with it?
 *
 * - A required message is always due: it can't be dismissed, so it comes back
 *   until the targeting stops matching (for example after an app update). It
 *   ignores frequency and max shows.
 * - Max shows, when set, stops any other message once seen that many times.
 * - once: never seen. every_launch: not yet seen in this launch.
 *   every_n_days: not seen in the last N days. until_dismissed: not dismissed.
 */
export function isMessageDue(
  message: Pick<InAppMessage, 'required' | 'frequency' | 'maxShows'>,
  receipt: MessageReceipt | null | undefined,
  now: Date | number,
  options: NextMessageOptions = {},
): boolean {
  if (message.required) return true;
  const seenCount = receipt?.seenCount ?? 0;
  if (message.maxShows !== undefined && seenCount >= message.maxShows) return false;

  const lastSeen = toMillis(receipt?.lastSeenAt);
  const never = !receipt || (seenCount === 0 && lastSeen === null);
  const nowMs = toMillis(now) ?? Date.now();

  switch (message.frequency.type) {
    case 'once':
      return never;
    case 'every_launch': {
      if (never || lastSeen === null) return true;
      return lastSeen < (toMillis(options.launchedAt) ?? MODULE_LOADED_AT);
    }
    case 'every_n_days': {
      if (never || lastSeen === null) return true;
      return nowMs - lastSeen >= message.frequency.days * DAY_MS;
    }
    case 'until_dismissed':
      return !receipt?.dismissedAt;
    default:
      return false;
  }
}

/**
 * The one message to show now, or null. Messages that don't allow this screen
 * or aren't due are skipped; the highest priority wins, and at equal priority
 * a required message comes first, then the order given (the server sends
 * oldest first). `route` is the current screen's route or route pattern.
 * Targeting, time window and status were already applied by the server.
 */
export function nextMessageToShow(
  messages: readonly InAppMessage[],
  receipts: Readonly<Record<string, MessageReceipt | undefined>>,
  route: string | null | undefined,
  now: Date | number,
  options: NextMessageOptions = {},
): InAppMessage | null {
  let best: InAppMessage | null = null;
  for (const message of messages) {
    if (!matchesScreen(message.screens, route)) continue;
    if (!isMessageDue(message, receipts[message.id], now, options)) continue;
    if (
      best === null ||
      message.priority > best.priority ||
      (message.priority === best.priority && message.required && !best.required)
    ) {
      best = message;
    }
  }
  return best;
}

/**
 * The receipt after an event, the way the server records it: seen adds one,
 * dismissed and clicked keep the latest time, and a first event of any kind
 * counts as a first sighting. Lets the app update what it holds without a
 * fetch.
 */
export function applyMessageEvent(
  messageId: string,
  receipt: MessageReceipt | null | undefined,
  event: MessageEvent,
  at: Date | number,
  button?: ClickedButton,
): MessageReceipt {
  const iso = new Date(toMillis(at) ?? Date.now()).toISOString();
  const next: MessageReceipt = receipt
    ? { ...receipt }
    : {
        messageId,
        firstSeenAt: iso,
        lastSeenAt: iso,
        seenCount: event === 'seen' ? 0 : 1,
        dismissedAt: null,
        clickedAt: null,
        clickedButton: null,
      };
  if (event === 'seen') {
    next.seenCount += 1;
    next.lastSeenAt = iso;
    next.firstSeenAt ??= iso;
  } else if (event === 'dismissed') {
    next.dismissedAt = iso;
  } else {
    next.clickedAt = iso;
    next.clickedButton = button ?? next.clickedButton;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Opening what a button points at

/** A web address a button may open. The server checks too; this is the app's own guard. */
export function isSafeWebUrl(url: string): boolean {
  return /^https:\/\/\S+$/i.test(url);
}

/** An app path ("/hub"), not a web address ("//evil.example") and not empty. */
export function isSafeRoute(href: string): boolean {
  return /^\/([^/\s]\S*)?$/.test(href);
}

// ---------------------------------------------------------------------------
// Checking what an admin wrote

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MESSAGE_LIMITS.url && /^https:\/\/\S+$/.test(value);
}

function isAppRoute(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MESSAGE_LIMITS.href &&
    /^\/([^/\s]\S*)?$/.test(value)
  );
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function checkAction(
  issues: MessageIssue[],
  field: string,
  action: ButtonAction | undefined,
  label: string | undefined,
): void {
  if (!action) return;
  if (action.type === 'link' && !isHttpsUrl(action.url)) {
    issues.push({ field, message: 'A link button needs a web address starting with https://.' });
  } else if (action.type === 'route' && !isAppRoute(action.href)) {
    issues.push({ field, message: 'A route button needs an app path starting with a single "/".' });
  } else if (!['dismiss', 'store', 'link', 'route'].includes(action.type)) {
    issues.push({ field, message: 'Unknown button action.' });
  }
  if (!hasText(label)) {
    issues.push({ field, message: 'A button needs an English label.' });
  } else if (label.trim().length > MESSAGE_LIMITS.label) {
    issues.push({ field, message: `A button label is at most ${MESSAGE_LIMITS.label} characters.` });
  }
}

/**
 * What is wrong with a message an admin is about to save; empty when it can be
 * saved. Mirrors the table's checks, plus two things only worth saying to a
 * person: a required (or non-dismissible) message needs a button that leads
 * somewhere, and the version range must be a range.
 */
export function validateMessage(draft: Partial<AdminMessageDraft>): MessageIssue[] {
  const issues: MessageIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  const name = (draft.name ?? '').trim();
  if (name.length < 1 || name.length > MESSAGE_LIMITS.name) {
    add('name', `Give the message a name (1 to ${MESSAGE_LIMITS.name} characters).`);
  }
  if (!draft.presentation || !PRESENTATIONS.includes(draft.presentation)) {
    add('presentation', 'Pick how the message is shown.');
  }
  if (draft.tone !== undefined && !TONES.includes(draft.tone)) add('tone', 'Unknown tone.');
  if (draft.icon !== undefined && draft.icon !== '' && !/^[A-Za-z0-9_-]{1,40}$/.test(draft.icon)) {
    add('icon', 'An icon name is letters, digits, "-" or "_", at most 40 characters.');
  }
  if (draft.imageUrl && !isHttpsUrl(draft.imageUrl)) {
    add('imageUrl', 'The image needs a web address starting with https://.');
  }
  if (draft.link && !isHttpsUrl(draft.link.url)) {
    add('link', 'The link needs a web address starting with https://.');
  }

  const content = draft.content ?? {};
  const languages = Object.keys(content);
  if (languages.length > MESSAGE_LIMITS.languages) add('content', 'Too many languages.');
  if (!hasText(content.en?.title)) add('content.en.title', 'English is required: give it a title.');
  for (const language of languages) {
    const entry = content[language];
    if (!entry) continue;
    if (!/^[a-z]{2,3}$/.test(language)) add(`content.${language}`, 'Language codes are two or three lowercase letters.');
    if (!hasText(entry.title) || entry.title.trim().length > MESSAGE_LIMITS.title) {
      add(`content.${language}.title`, `A title is 1 to ${MESSAGE_LIMITS.title} characters.`);
    }
    if ((entry.body ?? '').length > MESSAGE_LIMITS.body) {
      add(`content.${language}.body`, `The body is at most ${MESSAGE_LIMITS.body} characters.`);
    }
    for (const key of ['primaryLabel', 'secondaryLabel', 'linkLabel'] as const) {
      const label = entry[key];
      if (label !== undefined && label !== '' && label.trim().length > MESSAGE_LIMITS.label) {
        add(`content.${language}.${key}`, `A label is at most ${MESSAGE_LIMITS.label} characters.`);
      }
    }
  }
  checkAction(issues, 'primaryAction', draft.primaryAction, content.en?.primaryLabel);
  checkAction(issues, 'secondaryAction', draft.secondaryAction, content.en?.secondaryLabel);

  const frequency = draft.frequency;
  if (frequency && frequency.type === 'every_n_days' && !isInt(frequency.days, 1, MESSAGE_LIMITS.everyNDays)) {
    add('frequency', `Days is a whole number from 1 to ${MESSAGE_LIMITS.everyNDays}.`);
  }
  if (draft.maxShows !== undefined && !isInt(draft.maxShows, 1, MESSAGE_LIMITS.maxShows)) {
    add('maxShows', `Max shows is a whole number from 1 to ${MESSAGE_LIMITS.maxShows}.`);
  }
  if (draft.priority !== undefined && !isInt(draft.priority, -MESSAGE_LIMITS.priority, MESSAGE_LIMITS.priority)) {
    add('priority', `Priority is a whole number from -${MESSAGE_LIMITS.priority} to ${MESSAGE_LIMITS.priority}.`);
  }
  if (draft.delaySeconds !== undefined && !isInt(draft.delaySeconds, 0, MESSAGE_LIMITS.delaySeconds)) {
    add('delaySeconds', `Delay is a whole number of seconds from 0 to ${MESSAGE_LIMITS.delaySeconds}.`);
  }
  if (draft.bannerPosition !== undefined && draft.bannerPosition !== 'top' && draft.bannerPosition !== 'bottom') {
    add('bannerPosition', 'Banner position is top or bottom.');
  }

  const screens = draft.screens ?? [];
  if (screens.length > MESSAGE_LIMITS.screens) add('screens', `At most ${MESSAGE_LIMITS.screens} screens.`);
  if (screens.some((s) => !/^[A-Za-z0-9_.:/()[\]*-]{1,120}$/.test(s))) {
    add('screens', 'A screen is a route pattern such as /(tabs)/hub.');
  }

  const startsAt = draft.startsAt ? Date.parse(draft.startsAt) : null;
  const endsAt = draft.endsAt ? Date.parse(draft.endsAt) : null;
  if (draft.startsAt && Number.isNaN(startsAt)) add('startsAt', 'The start time is not a date.');
  if (draft.endsAt && Number.isNaN(endsAt)) add('endsAt', 'The end time is not a date.');
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) add('endsAt', 'The end must come after the start.');

  const targeting = draft.targeting ?? {};
  if ((targeting.userIds ?? []).length > MESSAGE_LIMITS.userIds) add('targeting.userIds', `At most ${MESSAGE_LIMITS.userIds} users.`);
  if ((targeting.userIds ?? []).some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    add('targeting.userIds', 'A user ID looks like 123e4567-e89b-12d3-a456-426614174000.');
  }
  if ((targeting.languages ?? []).some((l) => !/^[a-z]{2,3}$/.test(l))) {
    add('targeting.languages', 'Language codes are two or three lowercase letters.');
  }
  for (const key of ['minAppVersion', 'maxAppVersion'] as const) {
    const value = targeting[key];
    if (value !== undefined && value !== '' && !/^\d{1,5}(\.\d{1,5}){0,3}$/.test(value)) {
      add(`targeting.${key}`, 'A version looks like 1.4 or 1.4.2.');
    }
  }
  if (
    targeting.minAppVersion &&
    targeting.maxAppVersion &&
    parseVersion(targeting.minAppVersion) &&
    parseVersion(targeting.maxAppVersion) &&
    compareVersions(targeting.minAppVersion, targeting.maxAppVersion) >= 0
  ) {
    add('targeting.maxAppVersion', 'The highest version (exclusive) must be above the lowest.');
  }

  if (draft.required || draft.dismissible === false) {
    const leadsSomewhere = [draft.primaryAction, draft.secondaryAction].some(
      (action) => action && action.type !== 'dismiss',
    ) || Boolean(draft.link);
    if (!leadsSomewhere) {
      add(
        'primaryAction',
        'A message that can\'t be dismissed needs a button or link that leads somewhere, such as the store.',
      );
    }
  }

  return issues;
}
