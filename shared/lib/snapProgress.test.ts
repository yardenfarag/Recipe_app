import { describe, expect, it } from 'vitest';

import {
  PROGRESS_AT_COUNTDOWN_END,
  SNAP_TIMINGS,
  countdownSeconds,
  snapEtaAt,
  snapEtaText,
  snapProgressAt,
  snapStatusKeyAt,
  snapStatusLines,
  snapTimingKind,
  type SnapTimingKind,
} from './snapProgress';

const KINDS = Object.keys(SNAP_TIMINGS) as SnapTimingKind[];

describe('snapTimingKind', () => {
  it('reads the platform from the link', () => {
    expect(snapTimingKind('extract', 'https://www.tiktok.com/@cook/video/7312345678901234567')).toBe('tiktok');
    expect(snapTimingKind('extract', 'https://www.instagram.com/reel/C9xAbCdEfGh/')).toBe('instagram');
    expect(snapTimingKind('extract', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(snapTimingKind('extract', 'https://www.seriouseats.com/crispy-roast-potatoes')).toBe('web');
  });

  it('uses the photo timing without a link, and Guess the recipe for invent', () => {
    expect(snapTimingKind('extract', null)).toBe('photo');
    expect(snapTimingKind('invent', 'https://www.tiktok.com/@cook/video/7312345678901234567')).toBe('invent');
    expect(snapTimingKind('invent', null)).toBe('invent');
  });

  it('treats a link it cannot place as a web page', () => {
    expect(snapTimingKind('extract', 'not a link')).toBe('web');
  });

  it('uses the PDF timing for a PDF', () => {
    expect(snapTimingKind('extract', null, true)).toBe('pdf');
  });
});

describe('snapProgressAt', () => {
  it.each(KINDS)('%s starts at 0, never goes backwards and never fills', (kind) => {
    expect(snapProgressAt(kind, 0)).toBe(0);
    let previous = 0;
    for (let t = 0.5; t <= 300; t += 0.5) {
      const progress = snapProgressAt(kind, t);
      expect(progress).toBeGreaterThanOrEqual(previous);
      expect(progress).toBeLessThan(1);
      previous = progress;
    }
  });

  it.each(KINDS)('%s reaches 90%% when the countdown ends', (kind) => {
    expect(snapProgressAt(kind, countdownSeconds(kind))).toBeCloseTo(PROGRESS_AT_COUNTDOWN_END, 5);
  });

  it('treats a negative clock as no time at all', () => {
    expect(snapProgressAt('web', -3)).toBe(0);
  });
});

describe('countdownSeconds', () => {
  it('sits halfway between the usual time and the slow case', () => {
    expect(countdownSeconds('tiktok')).toBe(22.5);
    expect(countdownSeconds('web')).toBe(11);
  });
});

describe('snapEtaAt', () => {
  it('counts down in steps of 5 seconds', () => {
    expect(snapEtaAt('tiktok', 0)).toEqual({ kind: 'secondsLeft', seconds: 25 });
    expect(snapEtaAt('tiktok', 3)).toEqual({ kind: 'secondsLeft', seconds: 20 });
    expect(snapEtaAt('tiktok', 12)).toEqual({ kind: 'secondsLeft', seconds: 15 });
    expect(snapEtaAt('tiktok', 17)).toEqual({ kind: 'secondsLeft', seconds: 10 });
  });

  it('says "a few seconds" for the last 5', () => {
    expect(snapEtaAt('tiktok', 18)).toEqual({ kind: 'fewSecondsLeft' });
    expect(snapEtaAt('tiktok', 22)).toEqual({ kind: 'fewSecondsLeft' });
  });

  it('never counts back up after running out', () => {
    expect(snapEtaAt('tiktok', 23)).toEqual({ kind: 'fewMoreSeconds' });
    expect(snapEtaAt('tiktok', 28)).toEqual({ kind: 'fewMoreSeconds' });
    expect(snapEtaAt('tiktok', 29)).toEqual({ kind: 'longerThanUsual' });
    expect(snapEtaAt('tiktok', 120)).toEqual({ kind: 'longerThanUsual' });
  });

  it.each(KINDS)('%s only shows multiples of 5, falling over time', (kind) => {
    let previous = Infinity;
    for (let t = 0; t <= 60; t += 0.25) {
      const eta = snapEtaAt(kind, t);
      if (eta.kind !== 'secondsLeft') continue;
      expect(eta.seconds % 5).toBe(0);
      expect(eta.seconds).toBeLessThanOrEqual(previous);
      previous = eta.seconds;
    }
  });
});

describe('snapEtaText', () => {
  const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key);

  it('passes the seconds to the translation', () => {
    expect(snapEtaText({ kind: 'secondsLeft', seconds: 15 }, t)).toBe('snap.etaSecondsLeft:{"seconds":15}');
  });

  it('has a line for each other state', () => {
    expect(snapEtaText({ kind: 'fewSecondsLeft' }, t)).toBe('snap.etaFewSecondsLeft');
    expect(snapEtaText({ kind: 'fewMoreSeconds' }, t)).toBe('snap.etaFewMoreSeconds');
    expect(snapEtaText({ kind: 'longerThanUsual' }, t)).toBe('snap.etaLongerThanUsual');
  });
});

describe('snapStatusLines', () => {
  it('names what is being read', () => {
    expect(snapStatusLines('extract', null)[0].key).toBe('snap.statusReadingPhoto');
    expect(snapStatusLines('extract', null, true)[0].key).toBe('snap.statusReadingPdf');
    expect(snapStatusLines('extract', 'https://www.seriouseats.com/x')[0].key).toBe('snap.statusReadingPage');
    expect(snapStatusLines('extract', 'https://www.tiktok.com/@a/video/7312345678901234567')[0].key).toBe(
      'snap.statusReadingVideo',
    );
    expect(snapStatusLines('invent', 'https://www.tiktok.com/@a/video/7312345678901234567')[0].key).toBe(
      'snap.statusReadingVideo',
    );
  });

  it('goes through the lines in order and keeps the last one', () => {
    const lines = snapStatusLines('extract', 'https://www.seriouseats.com/x');
    expect(snapStatusKeyAt(lines, 0)).toBe('snap.statusReadingPage');
    expect(snapStatusKeyAt(lines, 0.3)).toBe('snap.statusIngredients');
    expect(snapStatusKeyAt(lines, 0.6)).toBe('snap.statusWritingSteps');
    expect(snapStatusKeyAt(lines, 0.85)).toBe('snap.statusAlmost');
    expect(snapStatusKeyAt(lines, 0.97)).toBe('snap.statusAlmost');
  });

  it('has three lines for Guess the recipe', () => {
    const lines = snapStatusLines('invent', null);
    expect(lines.map((line) => line.key)).toEqual([
      'snap.statusReadingPhoto',
      'snap.statusFiguringDish',
      'snap.statusWritingHome',
    ]);
  });
});
