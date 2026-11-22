import { describe, expect, it } from 'vitest';

import {
  eventLabel,
  feedbackMeta,
  feedbackSender,
  formatSessionDuration,
  parseCreditAmount,
  sessionPlatform,
  sessionWho,
  shortId,
  usd4,
} from './adminFormat';
import type { Feedback } from './supabase/feedback';

const feedback: Feedback = {
  id: 'f1',
  user_id: '12345678-aaaa-bbbb-cccc-1234567890ab',
  message: 'Love it',
  created_at: '2026-11-01T10:00:00Z',
  source: 'app',
  contact_email: null,
  profile: null,
  app_version: '1.0.10',
  build_number: '42',
  platform: 'ios',
  os_version: 'iOS 26',
  device_model: 'iPhone 17',
  locale: 'he',
};

describe('admin formatting', () => {
  it('says how long a session lasted', () => {
    expect(formatSessionDuration('2026-11-01T10:00:00Z', '2026-11-01T10:00:45Z')).toBe('45s');
    expect(formatSessionDuration('2026-11-01T10:00:00Z', '2026-11-01T10:12:00Z')).toBe('12m');
    expect(formatSessionDuration('2026-11-01T10:00:00Z', '2026-11-01T11:05:00Z')).toBe('1h 5m');
    expect(formatSessionDuration('2026-11-01T10:00:00Z', '2026-11-01T09:00:00Z')).toBe('0s');
  });

  it('names who a session belongs to and what it ran on', () => {
    expect(sessionWho({ email: 'a@b.co', userId: 'u1', guestInstallId: null })).toBe('a@b.co');
    expect(sessionWho({ email: null, userId: 'u1', guestInstallId: null })).toBe('u1');
    expect(sessionWho({ email: null, userId: null, guestInstallId: 'abcdef123456' })).toBe('Guest abcdef12');
    expect(sessionPlatform({ platform: 'web', appVersion: '1.0.11' })).toBe('web 1.0.11');
    expect(sessionPlatform({ platform: 'ios', appVersion: null })).toBe('ios');
  });

  it('shortens ids and money, and spells out event names', () => {
    expect(shortId('12345678-aaaa')).toBe('12345678');
    expect(shortId(null)).toBe('—');
    expect(usd4(0.01234)).toBe('$0.0123');
    expect(eventLabel('recipe_saved_from_hub')).toBe('recipe saved from hub');
  });

  it('describes where feedback came from and who sent it', () => {
    expect(feedbackMeta(feedback)).toBe('v1.0.10 (42) · ios · iPhone 17 · iOS 26 · he');
    expect(feedbackMeta({ ...feedback, source: 'website', app_version: null, platform: 'web', device_model: null, os_version: null, locale: null })).toBe(
      'website form · web',
    );
    expect(feedbackSender(feedback)).toBe('12345678');
    expect(feedbackSender({ ...feedback, contact_email: 'x@y.co' })).toBe('x@y.co');
    expect(feedbackSender({ ...feedback, profile: { email: 'p@q.co' }, contact_email: 'x@y.co' })).toBe('p@q.co');
  });

  it('reads a credit change, and refuses zero and words', () => {
    expect(parseCreditAmount('+10')).toBe(10);
    expect(parseCreditAmount(' -5 ')).toBe(-5);
    expect(parseCreditAmount('10 credits')).toBe(10);
    expect(parseCreditAmount('0')).toBeNull();
    expect(parseCreditAmount('')).toBeNull();
    expect(parseCreditAmount('ten')).toBeNull();
  });
});
