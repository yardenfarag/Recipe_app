import type {
  ButtonAction,
  ClickedButton,
  Frequency,
  InAppMessage,
  LocalizedContent,
  MessageEvent,
  MessagePlatform,
  MessageReceipt,
  Presentation,
  Tone,
} from '@/lib/inAppMessages';
import { supabase } from '@/lib/supabase/client';

/** One row of get_in_app_messages: the message, then the caller's own receipt. */
export type InAppMessageRow = {
  id: string;
  presentation: string;
  tone: string;
  icon: string | null;
  image_url: string | null;
  content: unknown;
  primary_action: unknown;
  secondary_action: unknown;
  link_url: string | null;
  dismissible: boolean;
  required: boolean;
  frequency: unknown;
  max_shows: number | null;
  priority: number;
  screens: string[] | null;
  banner_position: string | null;
  delay_seconds: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  seen_count: number;
  dismissed_at: string | null;
  clicked_at: string | null;
  clicked_button: string | null;
};

export type FetchedInAppMessages = {
  messages: InAppMessage[];
  /** Keyed by message id; only messages the caller has already seen, dismissed or tapped. */
  receipts: Record<string, MessageReceipt>;
};

const PRESENTATIONS = ['alert', 'sheet', 'banner', 'fullscreen'];
const TONES = ['info', 'success', 'warning', 'critical'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Reads a stored action; anything unreadable is left out rather than guessed at. */
export function mapAction(value: unknown): ButtonAction | undefined {
  if (!isRecord(value)) return undefined;
  switch (value.type) {
    case 'dismiss':
      return { type: 'dismiss' };
    case 'store':
      return { type: 'store' };
    case 'link':
      return typeof value.url === 'string' ? { type: 'link', url: value.url } : undefined;
    case 'route':
      return typeof value.href === 'string' ? { type: 'route', href: value.href } : undefined;
    default:
      return undefined;
  }
}

export function mapFrequency(value: unknown): Frequency {
  if (isRecord(value)) {
    if (value.type === 'every_launch') return { type: 'every_launch' };
    if (value.type === 'until_dismissed') return { type: 'until_dismissed' };
    if (value.type === 'every_n_days') {
      const days = optionalNumber(value.days);
      if (days !== undefined && days >= 1) return { type: 'every_n_days', days };
    }
  }
  return { type: 'once' };
}

export function mapContent(value: unknown): Record<string, LocalizedContent> {
  const content: Record<string, LocalizedContent> = {};
  if (!isRecord(value)) return content;
  for (const [language, entry] of Object.entries(value)) {
    if (!isRecord(entry) || typeof entry.title !== 'string') continue;
    const mapped: LocalizedContent = {
      title: entry.title,
      body: typeof entry.body === 'string' ? entry.body : '',
    };
    const primaryLabel = optionalString(entry.primaryLabel);
    const secondaryLabel = optionalString(entry.secondaryLabel);
    const linkLabel = optionalString(entry.linkLabel);
    if (primaryLabel) mapped.primaryLabel = primaryLabel;
    if (secondaryLabel) mapped.secondaryLabel = secondaryLabel;
    if (linkLabel) mapped.linkLabel = linkLabel;
    content[language] = mapped;
  }
  return content;
}

/** The fields shared by get_in_app_messages and admin_list_in_app_messages rows. */
export function mapMessageFields(
  row: Pick<
    InAppMessageRow,
    | 'id' | 'presentation' | 'tone' | 'icon' | 'image_url' | 'content' | 'primary_action'
    | 'secondary_action' | 'link_url' | 'dismissible' | 'required' | 'frequency' | 'max_shows'
    | 'priority' | 'screens' | 'banner_position' | 'delay_seconds'
  >,
): InAppMessage {
  const message: InAppMessage = {
    id: String(row.id),
    presentation: (PRESENTATIONS.includes(row.presentation) ? row.presentation : 'alert') as Presentation,
    tone: (TONES.includes(row.tone) ? row.tone : 'info') as Tone,
    content: mapContent(row.content),
    dismissible: row.dismissible !== false,
    required: row.required === true,
    frequency: mapFrequency(row.frequency),
    priority: Number(row.priority) || 0,
  };
  const icon = optionalString(row.icon);
  const imageUrl = optionalString(row.image_url);
  const primaryAction = mapAction(row.primary_action);
  const secondaryAction = mapAction(row.secondary_action);
  const linkUrl = optionalString(row.link_url);
  const maxShows = optionalNumber(row.max_shows);
  const delaySeconds = optionalNumber(row.delay_seconds);
  if (icon) message.icon = icon;
  if (imageUrl) message.imageUrl = imageUrl;
  if (primaryAction) message.primaryAction = primaryAction;
  if (secondaryAction) message.secondaryAction = secondaryAction;
  if (linkUrl) message.link = { url: linkUrl };
  if (maxShows !== undefined) message.maxShows = maxShows;
  if (Array.isArray(row.screens) && row.screens.length > 0) message.screens = row.screens.map(String);
  if (row.banner_position === 'top' || row.banner_position === 'bottom') {
    message.bannerPosition = row.banner_position;
  }
  if (delaySeconds !== undefined) message.delaySeconds = delaySeconds;
  return message;
}

export function mapMessageRow(row: InAppMessageRow): InAppMessage {
  return mapMessageFields(row);
}

/** The caller's receipt on a row, or null when they have never seen, dismissed or tapped it. */
export function mapReceiptRow(row: InAppMessageRow): MessageReceipt | null {
  const seenCount = Number(row.seen_count) || 0;
  if (seenCount === 0 && !row.first_seen_at && !row.dismissed_at && !row.clicked_at) return null;
  const button = row.clicked_button;
  return {
    messageId: String(row.id),
    firstSeenAt: row.first_seen_at ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    seenCount,
    dismissedAt: row.dismissed_at ?? null,
    clickedAt: row.clicked_at ?? null,
    clickedButton: button === 'primary' || button === 'secondary' || button === 'link' ? button : null,
  };
}

export function mapFetchedRows(rows: InAppMessageRow[]): FetchedInAppMessages {
  const messages: InAppMessage[] = [];
  const receipts: Record<string, MessageReceipt> = {};
  for (const row of rows) {
    messages.push(mapMessageRow(row));
    const receipt = mapReceiptRow(row);
    if (receipt) receipts[receipt.messageId] = receipt;
  }
  return { messages, receipts };
}

/**
 * The live messages for the signed-in user, in the order to consider them
 * (highest priority first), and the user's own receipts. The plan is worked
 * out on the server. Fails if nobody is signed in: call it only after sign-in.
 */
export async function fetchInAppMessages(params: {
  platform: MessagePlatform;
  /** The version string interactionLog.ts sends, e.g. "1.0.9" or "1.0.9-dev". */
  appVersion: string | null;
  /** The app language, e.g. "he". */
  language: string;
}): Promise<FetchedInAppMessages> {
  const { data, error } = await supabase.rpc('get_in_app_messages', {
    p_platform: params.platform,
    p_app_version: params.appVersion,
    p_language: params.language,
  });
  if (error) throw error;
  return mapFetchedRows((data ?? []) as InAppMessageRow[]);
}

/** Tells the server the user saw, dismissed or tapped a button on a message. */
export async function recordInAppMessageEvent(
  messageId: string,
  event: MessageEvent,
  button?: ClickedButton,
): Promise<void> {
  const { error } = await supabase.rpc('record_in_app_message_event', {
    p_message_id: messageId,
    p_event: event,
    p_button: event === 'clicked' ? (button ?? null) : null,
  });
  if (error) throw error;
}
