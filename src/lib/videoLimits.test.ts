import { describe, expect, it } from 'vitest';

import {
  isVideoTooLong,
  MAX_VIDEO_DURATION_SECONDS,
  normalizeDurationSeconds,
  parseDurationMilliseconds,
  parseDurationSeconds,
  parseYouTubeIsoDuration,
} from '../../supabase/functions/_shared/videoLimits.ts';

describe('videoLimits', () => {
  it('caps at three minutes', () => {
    expect(MAX_VIDEO_DURATION_SECONDS).toBe(180);
    expect(isVideoTooLong(181)).toBe(true);
    expect(isVideoTooLong(180)).toBe(false);
    expect(isVideoTooLong(undefined)).toBe(false);
  });

  it('parses YouTube ISO durations', () => {
    expect(parseYouTubeIsoDuration('PT45S')).toBe(45);
    expect(parseYouTubeIsoDuration('PT3M')).toBe(180);
    expect(parseYouTubeIsoDuration('PT1H2M3S')).toBe(3723);
  });

  it('parses YouTube Innertube lengthSeconds as seconds', () => {
    expect(parseDurationSeconds(45)).toBe(45);
    expect(parseDurationSeconds(2700)).toBe(2700);
    expect(isVideoTooLong(parseDurationSeconds(2700))).toBe(true);
  });

  it('normalizes millisecond platform durations', () => {
    expect(parseDurationMilliseconds(45_000)).toBe(45);
    expect(parseDurationMilliseconds(180_000)).toBe(180);
    expect(normalizeDurationSeconds(45_000)).toBe(45);
    expect(normalizeDurationSeconds(180)).toBe(180);
  });
});
