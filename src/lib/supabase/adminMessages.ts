import { decode } from 'base64-arraybuffer';

import {
  validateMessage,
  type AdminMessage,
  type AdminMessageDraft,
  type LocalizedContent,
  type MessageStatus,
  type Targeting,
} from '@/lib/inAppMessages';
import { supabase } from '@/lib/supabase/client';
import { mapMessageFields, type InAppMessageRow } from '@/lib/supabase/inAppMessages';

/** One row of admin_list_in_app_messages. */
export type AdminMessageRow = Omit<
  InAppMessageRow,
  | 'first_seen_at' | 'last_seen_at' | 'seen_count' | 'dismissed_at' | 'clicked_at' | 'clicked_button'
> & {
  name: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  targeting: unknown;
  created_at: string;
  updated_at: string;
  seen_count: number;
  dismissed_count: number;
  clicked_count: number;
};

/** What an admin can set a message to. "Scheduled" and "ended" follow from the times. */
export type SettableMessageStatus = 'draft' | 'live' | 'stopped';

const STATUSES: MessageStatus[] = ['draft', 'scheduled', 'live', 'stopped', 'ended'];

const IMAGE_BUCKET = 'recipe-thumbnails';
const IMAGE_FOLDER = 'in-app-messages';

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((item): item is string => typeof item === 'string');
  return list.length > 0 ? list : undefined;
}

export function mapTargeting(value: unknown): Targeting {
  const targeting: Targeting = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return targeting;
  const source = value as Record<string, unknown>;
  const userIds = stringList(source.userIds);
  const plans = stringList(source.plans)?.filter((p): p is 'free' | 'pro' => p === 'free' || p === 'pro');
  const platforms = stringList(source.platforms)?.filter(
    (p): p is 'ios' | 'android' | 'web' => p === 'ios' || p === 'android' || p === 'web',
  );
  const languages = stringList(source.languages);
  if (userIds) targeting.userIds = userIds;
  if (plans && plans.length > 0) targeting.plans = plans;
  if (platforms && platforms.length > 0) targeting.platforms = platforms;
  if (languages) targeting.languages = languages;
  if (typeof source.minAppVersion === 'string' && source.minAppVersion) {
    targeting.minAppVersion = source.minAppVersion;
  }
  if (typeof source.maxAppVersion === 'string' && source.maxAppVersion) {
    targeting.maxAppVersion = source.maxAppVersion;
  }
  return targeting;
}

export function mapAdminMessageRow(row: AdminMessageRow): AdminMessage {
  const status = STATUSES.includes(row.status as MessageStatus) ? (row.status as MessageStatus) : 'draft';
  return {
    ...mapMessageFields(row),
    name: String(row.name ?? ''),
    status,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    targeting: mapTargeting(row.targeting),
    seenCount: Number(row.seen_count) || 0,
    dismissedCount: Number(row.dismissed_count) || 0,
    clickedCount: Number(row.clicked_count) || 0,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function cleanContent(content: Record<string, LocalizedContent>): Record<string, LocalizedContent> {
  const cleaned: Record<string, LocalizedContent> = {};
  for (const [language, entry] of Object.entries(content)) {
    const title = (entry.title ?? '').trim();
    if (!title) continue; // an empty language is a language the admin didn't write
    const next: LocalizedContent = { title, body: entry.body ?? '' };
    for (const key of ['primaryLabel', 'secondaryLabel', 'linkLabel'] as const) {
      const label = (entry[key] ?? '').trim();
      if (label) next[key] = label;
    }
    cleaned[language.trim().toLowerCase()] = next;
  }
  return cleaned;
}

function cleanTargeting(targeting: Targeting): Targeting {
  const cleaned: Targeting = {};
  const userIds = unique((targeting.userIds ?? []).map((id) => id.trim().toLowerCase()).filter(Boolean));
  const languages = unique((targeting.languages ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean));
  if (userIds.length > 0) cleaned.userIds = userIds;
  if (targeting.plans && targeting.plans.length > 0) cleaned.plans = unique(targeting.plans) as Targeting['plans'];
  if (targeting.platforms && targeting.platforms.length > 0) {
    cleaned.platforms = unique(targeting.platforms) as Targeting['platforms'];
  }
  if (languages.length > 0) cleaned.languages = languages;
  if (targeting.minAppVersion?.trim()) cleaned.minAppVersion = targeting.minAppVersion.trim();
  if (targeting.maxAppVersion?.trim()) cleaned.maxAppVersion = targeting.maxAppVersion.trim();
  return cleaned;
}

/** The jsonb admin_save_in_app_message takes: tidied, with every optional field explicit (null clears it). */
export function buildSavePayload(draft: AdminMessageDraft): Record<string, unknown> {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name.trim(),
    presentation: draft.presentation,
    tone: draft.tone,
    icon: draft.icon?.trim() || null,
    imageUrl: draft.imageUrl?.trim() || null,
    content: cleanContent(draft.content),
    primaryAction: draft.primaryAction ?? null,
    secondaryAction: draft.secondaryAction ?? null,
    link: draft.link?.url.trim() ? { url: draft.link.url.trim() } : null,
    dismissible: draft.dismissible,
    required: draft.required,
    frequency: draft.frequency,
    maxShows: draft.maxShows ?? null,
    priority: draft.priority,
    screens: unique((draft.screens ?? []).map((s) => s.trim()).filter(Boolean)),
    bannerPosition: draft.bannerPosition ?? null,
    delaySeconds: draft.delaySeconds ?? null,
    startsAt: draft.startsAt || null,
    endsAt: draft.endsAt || null,
    targeting: cleanTargeting(draft.targeting),
  };
}

/** Every message, newest first, with how many users saw, dismissed and tapped each. */
export async function listAdminMessages(): Promise<AdminMessage[]> {
  const { data, error } = await supabase.rpc('admin_list_in_app_messages');
  if (error) throw error;
  return ((data ?? []) as AdminMessageRow[]).map(mapAdminMessageRow);
}

/**
 * Creates a message (a draft) or, when the draft has an id, updates it and
 * keeps its status. Throws with the first thing wrong before calling the server.
 */
export async function saveAdminMessage(draft: AdminMessageDraft): Promise<AdminMessage> {
  const payload = buildSavePayload(draft);
  const issues = validateMessage({
    ...draft,
    name: payload.name as string,
    content: payload.content as AdminMessageDraft['content'],
    targeting: payload.targeting as Targeting,
  });
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join(' '));
  }

  const { data: id, error } = await supabase.rpc('admin_save_in_app_message', { p_message: payload });
  if (error) throw error;

  const { data, error: readError } = await supabase.rpc('admin_list_in_app_messages', { p_id: id });
  if (readError) throw readError;
  const row = ((data ?? []) as AdminMessageRow[])[0];
  if (!row) throw new Error('The message was saved but could not be read back.');
  return mapAdminMessageRow(row);
}

/** Publish (live), stop (users stop seeing it at their next fetch) or take back to draft. */
export async function setAdminMessageStatus(id: string, status: SettableMessageStatus): Promise<void> {
  const { error } = await supabase.rpc('admin_set_in_app_message_status', {
    p_id: id,
    p_status: status,
  });
  if (error) throw error;
}

/** Deletes the message and its receipts. An uploaded image stays in storage. */
export async function deleteAdminMessage(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_in_app_message', { p_id: id });
  if (error) throw error;
}

const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

/** `in-app-messages/<time>-<random>.<ext>`, a fresh name every time so an upload never replaces a file. */
export function messageImagePath(fileExt: string, now: number, random: string): string {
  const ext = fileExt.trim().toLowerCase().replace(/^\./, '');
  if (!IMAGE_TYPES[ext]) throw new Error('Use a JPEG, PNG, WebP, GIF or AVIF image.');
  return `${IMAGE_FOLDER}/${now}-${random}.${ext}`;
}

/**
 * Uploads an image the admin picked (base64, from `expo-image-picker`) into the
 * existing `recipe-thumbnails` bucket under `in-app-messages/`, and returns its
 * public address to put in `imageUrl`. Only admins are allowed to write there.
 */
export async function uploadMessageImage(base64: string, fileExt: string): Promise<string> {
  const path = messageImagePath(fileExt, Date.now(), Math.random().toString(36).slice(2, 10));
  const ext = path.slice(path.lastIndexOf('.') + 1);

  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, decode(base64), {
    contentType: IMAGE_TYPES[ext],
    upsert: false,
  });
  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return publicUrl;
}
