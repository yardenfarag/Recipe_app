/**
 * The in-app message composer's form: what the inputs hold (all text, so a
 * half-typed number is still a value), how it becomes an `AdminMessageDraft`,
 * the presets, and the rules the form enforces for the admin. Pure, so it is
 * tested without a screen. The shared rules live in `@/lib/inAppMessages`
 * (`validateMessage`); this file only adds what is about the form.
 */
import {
  validateMessage,
  type AdminMessage,
  type AdminMessageDraft,
  type ButtonAction,
  type Frequency,
  type LocalizedContent,
  type MessageIssue,
  type MessagePlatform,
  type MessageStatus,
  type Presentation,
  type Targeting,
  type Tone,
} from '@/lib/inAppMessages';

export const MESSAGE_LANGUAGES = [
  { code: 'en', label: 'English', rtl: false },
  { code: 'he', label: 'Hebrew', rtl: true },
  { code: 'ar', label: 'Arabic', rtl: true },
  { code: 'es', label: 'Spanish', rtl: false },
  { code: 'ru', label: 'Russian', rtl: false },
] as const;

export type FormLanguage = (typeof MESSAGE_LANGUAGES)[number]['code'];

export const PRESENTATION_LABELS: Record<Presentation, string> = {
  alert: 'System alert',
  sheet: 'Sheet',
  banner: 'Banner',
  fullscreen: 'Full screen',
};

export const PRESENTATION_HINTS: Record<Presentation, string> = {
  alert: 'The phone’s own alert (a card on web). Title, body and up to two buttons. No image, icon or link.',
  sheet: 'A native sheet that slides up. Shows image, icon, body and buttons.',
  banner: 'A strip at the top or bottom of the screen. Does not block anything.',
  fullscreen: 'Takes the whole screen. The only way to show a required message.',
};

export const TONE_LABELS: Record<Tone, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  critical: 'Critical',
};

export const STATUS_LABELS: Record<MessageStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  live: 'Live',
  stopped: 'Stopped',
  ended: 'Ended',
};

export type ActionType = ButtonAction['type'];

export const ACTION_LABELS: Record<ActionType, string> = {
  dismiss: 'Close',
  link: 'Web link',
  route: 'App screen',
  store: 'Store page',
};

export type FrequencyType = Frequency['type'];

export const FREQUENCY_LABELS: Record<FrequencyType, string> = {
  once: 'Once',
  every_launch: 'Every launch',
  every_n_days: 'Every N days',
  until_dismissed: 'Until dismissed',
};

/** Icons the form offers; the field also takes any other Ionicons name. */
export const ICON_SUGGESTIONS = [
  'megaphone-outline',
  'sparkles-outline',
  'gift-outline',
  'information-circle-outline',
  'checkmark-circle-outline',
  'warning-outline',
  'alert-circle-outline',
  'cloud-download-outline',
  'rocket-outline',
  'heart-outline',
  'star-outline',
  'restaurant-outline',
] as const;

/** Screens an admin can add with one tap (route patterns as the interaction log writes them). */
export const SCREEN_SUGGESTIONS = [
  '/(tabs)',
  '/(tabs)/hub',
  '/(tabs)/add',
  '/(tabs)/list',
  '/(tabs)/favorites',
  '/(tabs)/settings',
  '/recipe/[id]',
] as const;

export type ButtonForm = {
  enabled: boolean;
  action: ActionType;
  /** Address for a web link, path for an app screen; unused for close and store. */
  target: string;
};

export type ContentForm = {
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
  linkLabel: string;
};

export type MessageForm = {
  id?: string;
  name: string;
  presentation: Presentation;
  tone: Tone;
  icon: string;
  imageUrl: string;
  content: Record<string, ContentForm>;
  primary: ButtonForm;
  secondary: ButtonForm;
  linkUrl: string;
  dismissible: boolean;
  required: boolean;
  frequency: FrequencyType;
  everyNDays: string;
  maxShows: string;
  priority: string;
  screens: string;
  bannerPosition: 'top' | 'bottom';
  delaySeconds: string;
  /** Local time, "2026-12-01 09:30". Empty = no limit. */
  startsAt: string;
  endsAt: string;
  /** User IDs and emails, separated by commas, spaces or new lines. */
  users: string;
  plans: ('free' | 'pro')[];
  platforms: MessagePlatform[];
  languages: string[];
  minAppVersion: string;
  maxAppVersion: string;
};

export function emptyContent(): ContentForm {
  return { title: '', body: '', primaryLabel: '', secondaryLabel: '', linkLabel: '' };
}

function emptyButton(): ButtonForm {
  return { enabled: false, action: 'dismiss', target: '' };
}

export function emptyForm(): MessageForm {
  const content: Record<string, ContentForm> = {};
  for (const language of MESSAGE_LANGUAGES) content[language.code] = emptyContent();
  return {
    name: '',
    presentation: 'sheet',
    tone: 'info',
    icon: '',
    imageUrl: '',
    content,
    primary: emptyButton(),
    secondary: emptyButton(),
    linkUrl: '',
    dismissible: true,
    required: false,
    frequency: 'once',
    everyNDays: '7',
    maxShows: '',
    priority: '0',
    screens: '',
    bannerPosition: 'top',
    delaySeconds: '',
    startsAt: '',
    endsAt: '',
    users: '',
    plans: [],
    platforms: [],
    languages: [],
    minAppVersion: '',
    maxAppVersion: '',
  };
}

// ---------------------------------------------------------------------------
// Rules the form enforces

/**
 * `required` is only allowed with the full-screen way of showing, so switching
 * it on switches that, and a required message is never dismissible.
 */
export function setRequired(form: MessageForm, required: boolean): MessageForm {
  if (!required) return { ...form, required: false, dismissible: true };
  return { ...form, required: true, presentation: 'fullscreen', dismissible: false };
}

/** Moving a required message off full screen would break the rule above, so it is turned off. */
export function setPresentation(form: MessageForm, presentation: Presentation): MessageForm {
  const next = { ...form, presentation };
  if (presentation !== 'fullscreen' && next.required) {
    next.required = false;
    next.dismissible = true;
  }
  return next;
}

/** An alert can't show an image, an icon or a link, and takes at most two buttons (the form has two). */
export function alertLimits(form: Pick<MessageForm, 'presentation'>): { image: boolean; icon: boolean; link: boolean } {
  const free = form.presentation !== 'alert';
  return { image: free, icon: free, link: free };
}

// ---------------------------------------------------------------------------
// Users

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedUsers = { ids: string[]; emails: string[]; unknown: string[] };

/** Splits the "who gets it" box into user IDs, emails and things that are neither. */
export function parseUsers(text: string): ParsedUsers {
  const ids = new Set<string>();
  const emails = new Set<string>();
  const unknown: string[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    const value = token.trim();
    if (!value) continue;
    if (UUID.test(value)) ids.add(value.toLowerCase());
    else if (EMAIL.test(value)) emails.add(value.toLowerCase());
    else unknown.push(value);
  }
  return { ids: [...ids], emails: [...emails], unknown };
}

/**
 * Turns the emails into user IDs with the people list (email -> id). Returns
 * the full ID list and the emails nobody has.
 */
export function resolveUsers(
  parsed: ParsedUsers,
  people: readonly { id: string; email: string | null }[],
): { userIds: string[]; missing: string[] } {
  const byEmail = new Map<string, string>();
  for (const person of people) {
    if (person.email) byEmail.set(person.email.toLowerCase(), person.id.toLowerCase());
  }
  const userIds = new Set(parsed.ids);
  const missing: string[] = [];
  for (const email of parsed.emails) {
    const id = byEmail.get(email);
    if (id) userIds.add(id);
    else missing.push(email);
  }
  return { userIds: [...userIds], missing };
}

// ---------------------------------------------------------------------------
// Times

const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/;

/** "2026-12-01 09:30" (local time) -> ISO string. '' -> null. Not a time -> the text back, so validation names it. */
export function parseLocalTime(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  const match = LOCAL_TIME.exec(value);
  if (!match) return value;
  const [, y, mo, d, h = '0', mi = '0'] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  const roundTrips =
    date.getFullYear() === Number(y) &&
    date.getMonth() === Number(mo) - 1 &&
    date.getDate() === Number(d) &&
    date.getHours() === Number(h) &&
    date.getMinutes() === Number(mi);
  return roundTrips ? date.toISOString() : value;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** ISO string -> "2026-12-01 09:30" in the admin's local time. */
export function formatLocalTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "Dec 1, 09:30 to open end" style line for the list. */
export function describeWindow(startsAt: string | null, endsAt: string | null): string {
  const fmt = (iso: string) => formatLocalTime(iso) || iso;
  if (startsAt && endsAt) return `${fmt(startsAt)} to ${fmt(endsAt)}`;
  if (startsAt) return `From ${fmt(startsAt)}, no end`;
  if (endsAt) return `Until ${fmt(endsAt)}`;
  return 'Always on, no end';
}

// ---------------------------------------------------------------------------
// Form <-> draft

function buttonFromAction(action: ButtonAction | undefined): ButtonForm {
  if (!action) return emptyButton();
  return {
    enabled: true,
    action: action.type,
    target: action.type === 'link' ? action.url : action.type === 'route' ? action.href : '',
  };
}

function actionFromButton(button: ButtonForm): ButtonAction | undefined {
  if (!button.enabled) return undefined;
  switch (button.action) {
    case 'link':
      return { type: 'link', url: button.target.trim() };
    case 'route':
      return { type: 'route', href: button.target.trim() };
    case 'store':
      return { type: 'store' };
    default:
      return { type: 'dismiss' };
  }
}

function contentFormFrom(entry: LocalizedContent | undefined): ContentForm {
  return {
    title: entry?.title ?? '',
    body: entry?.body ?? '',
    primaryLabel: entry?.primaryLabel ?? '',
    secondaryLabel: entry?.secondaryLabel ?? '',
    linkLabel: entry?.linkLabel ?? '',
  };
}

export function formFromMessage(message: AdminMessage | AdminMessageDraft): MessageForm {
  const form = emptyForm();
  for (const [language, entry] of Object.entries(message.content)) {
    form.content[language] = contentFormFrom(entry);
  }
  const frequency = message.frequency;
  return {
    ...form,
    id: message.id,
    name: message.name,
    presentation: message.presentation,
    tone: message.tone,
    icon: message.icon ?? '',
    imageUrl: message.imageUrl ?? '',
    primary: buttonFromAction(message.primaryAction),
    secondary: buttonFromAction(message.secondaryAction),
    linkUrl: message.link?.url ?? '',
    dismissible: message.dismissible,
    required: message.required,
    frequency: frequency.type,
    everyNDays: frequency.type === 'every_n_days' ? String(frequency.days) : form.everyNDays,
    maxShows: message.maxShows === undefined ? '' : String(message.maxShows),
    priority: String(message.priority),
    screens: (message.screens ?? []).join('\n'),
    bannerPosition: message.bannerPosition ?? 'top',
    delaySeconds: message.delaySeconds === undefined ? '' : String(message.delaySeconds),
    startsAt: formatLocalTime(message.startsAt),
    endsAt: formatLocalTime(message.endsAt),
    users: (message.targeting.userIds ?? []).join('\n'),
    plans: [...(message.targeting.plans ?? [])],
    platforms: [...(message.targeting.platforms ?? [])],
    languages: [...(message.targeting.languages ?? [])],
    minAppVersion: message.targeting.minAppVersion ?? '',
    maxAppVersion: message.targeting.maxAppVersion ?? '',
  };
}

/** A copy that saves as a new draft. */
export function duplicateForm(form: MessageForm): MessageForm {
  const { id: _id, ...rest } = form;
  void _id;
  return { ...rest, name: `Copy of ${form.name}`.slice(0, 120) };
}

function whole(text: string): number | undefined {
  const value = text.trim();
  return value === '' ? undefined : Number(value);
}

export function splitScreens(text: string): string[] {
  return [...new Set(text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))];
}

/**
 * The draft to validate and save. `userIds` are the already-resolved user IDs
 * (the form holds emails too). Applies the form's rules again so a stale form
 * state can't save something the form would not allow.
 */
export function draftFromForm(form: MessageForm, userIds: readonly string[]): AdminMessageDraft {
  const required = form.required;
  const presentation: Presentation = required ? 'fullscreen' : form.presentation;
  const limits = alertLimits({ presentation });

  const content: Record<string, LocalizedContent> = {};
  const primary = actionFromButton(form.primary);
  const secondary = actionFromButton(form.secondary);
  const linkUrl = limits.link ? form.linkUrl.trim() : '';
  for (const [language, entry] of Object.entries(form.content)) {
    const next: LocalizedContent = { title: entry.title, body: entry.body };
    if (primary) next.primaryLabel = entry.primaryLabel;
    if (secondary) next.secondaryLabel = entry.secondaryLabel;
    if (linkUrl) next.linkLabel = entry.linkLabel;
    // A language nobody wrote in is not a language of the message.
    const written = Object.values(next).some((value) => value.trim() !== '');
    if (written) content[language] = next;
  }

  const frequency: Frequency =
    form.frequency === 'every_n_days'
      ? { type: 'every_n_days', days: Number(form.everyNDays.trim() === '' ? NaN : form.everyNDays) }
      : { type: form.frequency };

  const targeting: Targeting = {};
  if (userIds.length > 0) targeting.userIds = [...userIds];
  if (form.plans.length > 0) targeting.plans = [...form.plans];
  if (form.platforms.length > 0) targeting.platforms = [...form.platforms];
  if (form.languages.length > 0) targeting.languages = [...form.languages];
  if (form.minAppVersion.trim()) targeting.minAppVersion = form.minAppVersion.trim();
  if (form.maxAppVersion.trim()) targeting.maxAppVersion = form.maxAppVersion.trim();

  const draft: AdminMessageDraft = {
    name: form.name,
    presentation,
    tone: form.tone,
    content,
    dismissible: required ? false : form.dismissible,
    required,
    frequency,
    priority: form.priority.trim() === '' ? 0 : Number(form.priority),
    startsAt: parseLocalTime(form.startsAt),
    endsAt: parseLocalTime(form.endsAt),
    targeting,
  };
  if (form.id) draft.id = form.id;
  if (limits.icon && form.icon.trim()) draft.icon = form.icon.trim();
  if (limits.image && form.imageUrl.trim()) draft.imageUrl = form.imageUrl.trim();
  if (primary) draft.primaryAction = primary;
  if (secondary) draft.secondaryAction = secondary;
  if (linkUrl) draft.link = { url: linkUrl };
  const maxShows = whole(form.maxShows);
  if (maxShows !== undefined) draft.maxShows = maxShows;
  const delaySeconds = whole(form.delaySeconds);
  if (delaySeconds !== undefined) draft.delaySeconds = delaySeconds;
  const screens = splitScreens(form.screens);
  if (screens.length > 0) draft.screens = screens;
  if (presentation === 'banner') draft.bannerPosition = form.bannerPosition;
  return draft;
}

// ---------------------------------------------------------------------------
// Checking

/** `validateMessage`, plus the things only the form knows about. */
export function formIssues(form: MessageForm, parsed: ParsedUsers, missingEmails: readonly string[] = []): MessageIssue[] {
  const draft = draftFromForm(form, parsed.ids);
  const issues = validateMessage(draft);
  if (draft.link && !form.content.en?.linkLabel.trim()) {
    issues.push({ field: 'link', message: 'Give the link an English label.' });
  }
  for (const token of parsed.unknown) {
    issues.push({ field: 'targeting.userIds', message: `“${token}” is not a user ID or an email.` });
  }
  for (const email of missingEmails) {
    issues.push({ field: 'targeting.userIds', message: `No user has the email ${email}.` });
  }
  return issues;
}

/** The messages for one field (exact name), or every field below a prefix when `deep` is set. */
export function issuesFor(issues: readonly MessageIssue[], field: string, deep = false): string[] {
  return issues
    .filter((issue) => issue.field === field || (deep && issue.field.startsWith(`${field}.`)))
    .map((issue) => issue.message);
}

// ---------------------------------------------------------------------------
// Presets

export type PresetId = 'announcement' | 'update-below' | 'required-update' | 'one-user';

export const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: 'announcement', label: 'Announcement to everyone', hint: 'A sheet, shown once to every signed-in user.' },
  { id: 'update-below', label: 'Update prompt below version X', hint: 'A banner with a store button for older app versions. Fill in the version.' },
  { id: 'required-update', label: 'Required update', hint: 'Full screen, cannot be closed, store button, for older versions.' },
  { id: 'one-user', label: 'Popup to one user', hint: 'A sheet shown once to the user ID or email you give.' },
];

function withEnglishLabel(form: MessageForm, key: 'primaryLabel' | 'secondaryLabel', label: string): MessageForm {
  const en = form.content.en ?? emptyContent();
  if (en[key].trim()) return form;
  return { ...form, content: { ...form.content, en: { ...en, [key]: label } } };
}

/**
 * Fills the settings a preset stands for. Anything the admin already typed
 * (name, texts, image) stays; the targeting and the way of showing are the
 * preset's.
 */
export function applyPreset(form: MessageForm, preset: PresetId): MessageForm {
  const fresh = emptyForm();
  const base: MessageForm = {
    ...fresh,
    id: form.id,
    name: form.name,
    icon: form.icon,
    imageUrl: form.imageUrl,
    content: form.content,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    priority: form.priority,
  };
  const named = (label: string): MessageForm => (base.name.trim() ? base : { ...base, name: label });

  switch (preset) {
    case 'announcement':
      return {
        ...named('Announcement'),
        presentation: 'sheet',
        tone: 'info',
        frequency: 'once',
        dismissible: true,
      };
    case 'update-below':
      return withEnglishLabel(
        {
          ...named('Update prompt'),
          presentation: 'banner',
          tone: 'info',
          icon: base.icon || 'cloud-download-outline',
          frequency: 'every_n_days',
          everyNDays: '2',
          dismissible: true,
          platforms: ['ios', 'android'],
          maxAppVersion: '',
          primary: { enabled: true, action: 'store', target: '' },
        },
        'primaryLabel',
        'Update',
      );
    case 'required-update':
      return withEnglishLabel(
        {
          ...named('Required update'),
          presentation: 'fullscreen',
          tone: 'critical',
          icon: base.icon || 'cloud-download-outline',
          required: true,
          dismissible: false,
          frequency: 'every_launch',
          platforms: ['ios', 'android'],
          priority: base.priority === '0' ? '100' : base.priority,
          maxAppVersion: '',
          primary: { enabled: true, action: 'store', target: '' },
        },
        'primaryLabel',
        'Update now',
      );
    case 'one-user':
      return {
        ...named('Message to one user'),
        presentation: 'sheet',
        tone: 'info',
        frequency: 'once',
        dismissible: true,
      };
  }
}

/** Whether the preset still needs the admin to fill something before saving. */
export function presetNeeds(preset: PresetId): string | null {
  switch (preset) {
    case 'update-below':
    case 'required-update':
      return 'Fill in the “Below version” field in Who gets it.';
    case 'one-user':
      return 'Fill in the user in Who gets it.';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// "Send to me only"

/**
 * A new live copy of the message for the admin's own device: targeted at their
 * user ID only, no start or end, and named so it is easy to find and stop.
 */
export function testDraft(form: MessageForm, adminUserId: string): AdminMessageDraft {
  const draft = draftFromForm({ ...form, id: undefined }, [adminUserId]);
  delete draft.id;
  return {
    ...draft,
    name: `Test: ${draft.name.trim() || 'untitled'}`.slice(0, 120),
    startsAt: null,
    endsAt: null,
    targeting: { userIds: [adminUserId.toLowerCase()] },
  };
}

/** What the list's Stop / Resume buttons do for a status; null when the row has no such button. */
export function statusActions(status: MessageStatus): { stop: boolean; start: boolean } {
  return {
    stop: status === 'live' || status === 'scheduled',
    start: status === 'draft' || status === 'stopped',
  };
}

/** One line for the list: who the message goes to. */
export function describeTargeting(targeting: Targeting): string {
  const parts: string[] = [];
  const count = targeting.userIds?.length ?? 0;
  if (count > 0) parts.push(count === 1 ? '1 user' : `${count} users`);
  if (targeting.plans?.length) parts.push(`${targeting.plans.join(' + ')} plan`);
  if (targeting.platforms?.length) parts.push(targeting.platforms.join(' + '));
  if (targeting.languages?.length) parts.push(`language ${targeting.languages.join(' + ')}`);
  if (targeting.minAppVersion) parts.push(`from ${targeting.minAppVersion}`);
  if (targeting.maxAppVersion) parts.push(`below ${targeting.maxAppVersion}`);
  return parts.length > 0 ? parts.join(' · ') : 'Everyone signed in';
}
