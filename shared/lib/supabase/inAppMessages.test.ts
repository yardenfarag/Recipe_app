import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminMessageDraft } from '../inAppMessages';
import {
  buildSavePayload,
  mapAdminMessageRow,
  messageImagePath,
  type AdminMessageRow,
} from './adminMessages';
import {
  fetchInAppMessages,
  mapFetchedRows,
  mapMessageRow,
  mapReceiptRow,
  recordInAppMessageEvent,
  type InAppMessageRow,
} from './inAppMessages';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  supabase: { rpc, storage: { from: vi.fn() } },
}));

function row(overrides: Partial<InAppMessageRow> = {}): InAppMessageRow {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    presentation: 'sheet',
    tone: 'warning',
    icon: 'sparkles',
    image_url: 'https://example.com/hero.png',
    content: {
      en: { title: 'Update', body: 'Please update', primaryLabel: 'Update now' },
      he: { title: 'עדכון', body: 'אנא עדכנו' },
    },
    primary_action: { type: 'store' },
    secondary_action: { type: 'dismiss' },
    link_url: 'https://example.com/notes',
    dismissible: false,
    required: true,
    frequency: { type: 'every_n_days', days: 3 },
    max_shows: 5,
    priority: 7,
    screens: ['/(tabs)/hub'],
    banner_position: 'top',
    delay_seconds: 2,
    first_seen_at: null,
    last_seen_at: null,
    seen_count: 0,
    dismissed_at: null,
    clicked_at: null,
    clicked_button: null,
    ...overrides,
  };
}

describe('mapMessageRow', () => {
  it('maps every column to the InAppMessage field of the same meaning', () => {
    expect(mapMessageRow(row())).toEqual({
      id: 'a0000000-0000-4000-8000-000000000001',
      presentation: 'sheet',
      tone: 'warning',
      icon: 'sparkles',
      imageUrl: 'https://example.com/hero.png',
      content: {
        en: { title: 'Update', body: 'Please update', primaryLabel: 'Update now' },
        he: { title: 'עדכון', body: 'אנא עדכנו' },
      },
      primaryAction: { type: 'store' },
      secondaryAction: { type: 'dismiss' },
      link: { url: 'https://example.com/notes' },
      dismissible: false,
      required: true,
      frequency: { type: 'every_n_days', days: 3 },
      maxShows: 5,
      priority: 7,
      screens: ['/(tabs)/hub'],
      bannerPosition: 'top',
      delaySeconds: 2,
    });
  });

  it('leaves out what is not set instead of sending nulls', () => {
    const mapped = mapMessageRow(
      row({
        icon: null,
        image_url: null,
        primary_action: null,
        secondary_action: null,
        link_url: null,
        max_shows: null,
        screens: [],
        banner_position: null,
        delay_seconds: null,
        required: false,
        dismissible: true,
        frequency: { type: 'once' },
      }),
    );
    expect(mapped).not.toHaveProperty('icon');
    expect(mapped).not.toHaveProperty('imageUrl');
    expect(mapped).not.toHaveProperty('primaryAction');
    expect(mapped).not.toHaveProperty('link');
    expect(mapped).not.toHaveProperty('maxShows');
    expect(mapped).not.toHaveProperty('screens');
    expect(mapped).not.toHaveProperty('bannerPosition');
    expect(mapped).not.toHaveProperty('delaySeconds');
  });

  it('survives unreadable stored values', () => {
    const mapped = mapMessageRow(
      row({
        presentation: 'toast',
        tone: 'loud',
        content: 'nope',
        primary_action: { type: 'teleport' },
        frequency: { type: 'every_n_days', days: 'x' },
      }),
    );
    expect(mapped.presentation).toBe('alert');
    expect(mapped.tone).toBe('info');
    expect(mapped.content).toEqual({});
    expect(mapped).not.toHaveProperty('primaryAction');
    expect(mapped.frequency).toEqual({ type: 'once' });
  });
});

describe('mapReceiptRow', () => {
  it('is null for a message the user has not touched', () => {
    expect(mapReceiptRow(row())).toBeNull();
  });

  it('maps the receipt columns', () => {
    expect(
      mapReceiptRow(
        row({
          first_seen_at: '2026-11-10T10:00:00Z',
          last_seen_at: '2026-11-12T10:00:00Z',
          seen_count: 3,
          dismissed_at: '2026-11-12T10:00:05Z',
          clicked_at: '2026-11-11T09:00:00Z',
          clicked_button: 'primary',
        }),
      ),
    ).toEqual({
      messageId: 'a0000000-0000-4000-8000-000000000001',
      firstSeenAt: '2026-11-10T10:00:00Z',
      lastSeenAt: '2026-11-12T10:00:00Z',
      seenCount: 3,
      dismissedAt: '2026-11-12T10:00:05Z',
      clickedAt: '2026-11-11T09:00:00Z',
      clickedButton: 'primary',
    });
  });

  it('keys receipts by message id and only for seen messages', () => {
    const fetched = mapFetchedRows([
      row({ id: 'm-new' }),
      row({ id: 'm-seen', seen_count: 1, first_seen_at: '2026-11-10T10:00:00Z', last_seen_at: '2026-11-10T10:00:00Z' }),
    ]);
    expect(fetched.messages.map((m) => m.id)).toEqual(['m-new', 'm-seen']);
    expect(Object.keys(fetched.receipts)).toEqual(['m-seen']);
  });
});

describe('client calls', () => {
  beforeEach(() => rpc.mockReset());

  it('fetches with the platform, version and language', async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    const result = await fetchInAppMessages({ platform: 'ios', appVersion: '1.0.9', language: 'he' });
    expect(rpc).toHaveBeenCalledWith('get_in_app_messages', {
      p_platform: 'ios',
      p_app_version: '1.0.9',
      p_language: 'he',
    });
    expect(result.messages).toHaveLength(1);
  });

  it('throws the server error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '28000', message: 'not_signed_in' } });
    await expect(
      fetchInAppMessages({ platform: 'web', appVersion: null, language: 'en' }),
    ).rejects.toMatchObject({ code: '28000' });
  });

  it('sends a button only with a tap', async () => {
    rpc.mockResolvedValue({ error: null });
    await recordInAppMessageEvent('m1', 'clicked', 'secondary');
    await recordInAppMessageEvent('m1', 'seen', 'primary');
    expect(rpc).toHaveBeenNthCalledWith(1, 'record_in_app_message_event', {
      p_message_id: 'm1',
      p_event: 'clicked',
      p_button: 'secondary',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'record_in_app_message_event', {
      p_message_id: 'm1',
      p_event: 'seen',
      p_button: null,
    });
  });
});

describe('admin rows', () => {
  const adminRow: AdminMessageRow = {
    ...row(),
    name: 'Update prompt',
    status: 'scheduled',
    starts_at: '2026-11-20T00:00:00Z',
    ends_at: null,
    targeting: {
      userIds: ['10000000-0000-4000-8000-000000000001'],
      plans: ['free', 'gold'],
      platforms: ['ios', 'web'],
      languages: ['he'],
      minAppVersion: '1.0',
      maxAppVersion: '1.4.0',
    },
    created_at: '2026-11-16T10:00:00Z',
    updated_at: '2026-11-16T10:00:00Z',
    seen_count: 12,
    dismissed_count: 4,
    clicked_count: 7,
  };

  it('adds the admin parts to the message', () => {
    const mapped = mapAdminMessageRow(adminRow);
    expect(mapped.name).toBe('Update prompt');
    expect(mapped.status).toBe('scheduled');
    expect(mapped.startsAt).toBe('2026-11-20T00:00:00Z');
    expect(mapped.endsAt).toBeNull();
    expect(mapped.seenCount).toBe(12);
    expect(mapped.dismissedCount).toBe(4);
    expect(mapped.clickedCount).toBe(7);
    expect(mapped.presentation).toBe('sheet');
    expect(mapped.targeting).toEqual({
      userIds: ['10000000-0000-4000-8000-000000000001'],
      plans: ['free'], // an unknown plan is dropped
      platforms: ['ios', 'web'],
      languages: ['he'],
      minAppVersion: '1.0',
      maxAppVersion: '1.4.0',
    });
  });

  it('reads an unknown status as a draft and no targeting as empty', () => {
    const mapped = mapAdminMessageRow({ ...adminRow, status: 'weird', targeting: null });
    expect(mapped.status).toBe('draft');
    expect(mapped.targeting).toEqual({});
  });
});

describe('save payload', () => {
  const draft: AdminMessageDraft = {
    name: '  Update prompt ',
    presentation: 'banner',
    tone: 'info',
    icon: ' ',
    content: {
      en: { title: ' Update ', body: 'Please', primaryLabel: 'Update', secondaryLabel: '  ' },
      HE: { title: 'עדכון', body: '' },
      es: { title: '   ', body: 'sin título' },
    },
    primaryAction: { type: 'store' },
    dismissible: true,
    required: false,
    frequency: { type: 'once' },
    priority: 3,
    screens: [' /(tabs)/hub ', '', '/(tabs)/hub'],
    startsAt: '',
    endsAt: null,
    targeting: {
      userIds: ['10000000-0000-4000-8000-00000000000A', '10000000-0000-4000-8000-00000000000a'],
      plans: ['pro'],
      platforms: [],
      languages: [' HE '],
      minAppVersion: ' ',
    },
  };

  it('tidies the draft and sends every optional field explicitly', () => {
    expect(buildSavePayload(draft)).toEqual({
      name: 'Update prompt',
      presentation: 'banner',
      tone: 'info',
      icon: null,
      imageUrl: null,
      content: {
        en: { title: 'Update', body: 'Please', primaryLabel: 'Update' },
        he: { title: 'עדכון', body: '' },
      },
      primaryAction: { type: 'store' },
      secondaryAction: null,
      link: null,
      dismissible: true,
      required: false,
      frequency: { type: 'once' },
      maxShows: null,
      priority: 3,
      screens: ['/(tabs)/hub'],
      bannerPosition: null,
      delaySeconds: null,
      startsAt: null,
      endsAt: null,
      targeting: {
        userIds: ['10000000-0000-4000-8000-00000000000a'],
        plans: ['pro'],
        languages: ['he'],
      },
    });
  });

  it('keeps the id when updating', () => {
    expect(buildSavePayload({ ...draft, id: 'abc' })).toHaveProperty('id', 'abc');
  });
});

describe('image path', () => {
  it('lives under in-app-messages/ with a fresh name', () => {
    expect(messageImagePath('PNG', 1700000000000, 'abc123')).toBe('in-app-messages/1700000000000-abc123.png');
    expect(messageImagePath('.jpeg', 5, 'x')).toBe('in-app-messages/5-x.jpeg');
  });

  it('refuses a type the bucket does not take', () => {
    expect(() => messageImagePath('svg', 1, 'x')).toThrow();
    expect(() => messageImagePath('../../etc', 1, 'x')).toThrow();
  });
});
