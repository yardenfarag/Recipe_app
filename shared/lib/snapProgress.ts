import { detectPlatform } from './platformUrls';

/**
 * The Snap wait: a progress ring and a countdown, both driven by elapsed time. The Edge Functions answer once, at
 * the end, so nothing reports real progress; instead each kind of source counts down from how long it usually
 * takes, measured from `ai_usage_events.duration_ms`.
 */

export type SnapTimingKind =
  | 'tiktok'
  | 'instagram'
  | 'youtube'
  | 'facebook'
  | 'pinterest'
  | 'web'
  | 'photo'
  | 'pdf'
  | 'invent';

/**
 * Seconds. `usual` is about the median and `slow` about the 90th percentile of successful imports. The links come
 * from 30 days of `ai_usage_events` up to 2026-11-21. Facebook had too few rows and borrows Instagram's numbers;
 * photo, PDF and Guess the recipe are estimates until they are measured. A PDF with text reads about as fast as a web
 * page; a scanned one goes to the photo model page by page, so it is slower than one photo (PIN-72).
 */
export const SNAP_TIMINGS: Record<SnapTimingKind, { usual: number; slow: number }> = {
  tiktok: { usual: 17, slow: 28 },
  instagram: { usual: 19, slow: 36 },
  facebook: { usual: 19, slow: 36 },
  // Not measured yet (PIN-70): a pin page, then usually the site it links to. Video pins are slower but rarer.
  pinterest: { usual: 11, slow: 20 },
  youtube: { usual: 13, slow: 30 },
  web: { usual: 9, slow: 13 },
  photo: { usual: 12, slow: 22 },
  pdf: { usual: 15, slow: 35 },
  invent: { usual: 10, slow: 18 },
};

/** The progress when the countdown reaches zero. After that it only creeps, and never fills until the answer. */
export const PROGRESS_AT_COUNTDOWN_END = 0.9;
const PROGRESS_CEILING = 0.97;

/** Which timing a Snap uses. A link that isn't a known platform is read as a web page. A PDF is only ever a Snap. */
export function snapTimingKind(
  intent: 'extract' | 'invent',
  url: string | null | undefined,
  pdf = false,
): SnapTimingKind {
  if (pdf) return 'pdf';
  if (intent === 'invent') return 'invent';
  if (!url) return 'photo';
  const platform = detectPlatform(url);
  if (
    platform === 'tiktok' ||
    platform === 'instagram' ||
    platform === 'youtube' ||
    platform === 'facebook' ||
    platform === 'pinterest'
  ) {
    return platform;
  }
  return 'web';
}

/**
 * Where the countdown starts: halfway between the usual time and the slow case, so about 3 in 4 imports finish
 * before it runs out. Counting to the median would run out for half of them.
 */
export function countdownSeconds(kind: SnapTimingKind): number {
  const { usual, slow } = SNAP_TIMINGS[kind];
  return usual + (slow - usual) / 2;
}

/** How full the ring is, 0 to 0.97, after this many seconds. It eases out, and never goes backwards. */
export function snapProgressAt(kind: SnapTimingKind, elapsedSeconds: number): number {
  const t = Math.max(0, elapsedSeconds);
  const end = countdownSeconds(kind);
  if (t <= end) return PROGRESS_AT_COUNTDOWN_END * (1 - Math.pow(1 - t / end, 1.3));
  const { usual, slow } = SNAP_TIMINGS[kind];
  const creep = 1 - Math.exp(-(t - end) / (slow - usual));
  return PROGRESS_AT_COUNTDOWN_END + (PROGRESS_CEILING - PROGRESS_AT_COUNTDOWN_END) * creep;
}

export type SnapEta =
  | { kind: 'secondsLeft'; seconds: number }
  | { kind: 'fewSecondsLeft' }
  | { kind: 'fewMoreSeconds' }
  | { kind: 'longerThanUsual' };

/**
 * The time left, in steps of 5 seconds like a download, then "a few seconds". When the countdown runs out it says
 * so instead of counting back up. Steps of 5 also keep the number in one grammatical form in every language.
 */
export function snapEtaAt(kind: SnapTimingKind, elapsedSeconds: number): SnapEta {
  const left = countdownSeconds(kind) - elapsedSeconds;
  if (left > 5) return { kind: 'secondsLeft', seconds: Math.ceil(left / 5) * 5 };
  if (left > 0) return { kind: 'fewSecondsLeft' };
  if (elapsedSeconds <= SNAP_TIMINGS[kind].slow) return { kind: 'fewMoreSeconds' };
  return { kind: 'longerThanUsual' };
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The countdown in the person's language. */
export function snapEtaText(eta: SnapEta, t: Translate): string {
  switch (eta.kind) {
    case 'secondsLeft':
      return t('snap.etaSecondsLeft', { count: eta.seconds });
    case 'fewSecondsLeft':
      return t('snap.etaFewSecondsLeft');
    case 'fewMoreSeconds':
      return t('snap.etaFewMoreSeconds');
    case 'longerThanUsual':
      return t('snap.etaLongerThanUsual');
  }
}

export type SnapStatusLine = { key: string; from: number };

/** What Pinch says it is doing, and the progress at which each line starts. A photo or a PDF has no link. */
export function snapStatusLines(
  intent: 'extract' | 'invent',
  url: string | null | undefined,
  pdf = false,
): SnapStatusLine[] {
  const reading = pdf
    ? 'snap.statusReadingPdf'
    : !url
    ? 'snap.statusReadingPhoto'
    : detectPlatform(url) === 'web'
      ? 'snap.statusReadingPage'
      : 'snap.statusReadingVideo';
  if (intent === 'invent') {
    return [
      { key: reading, from: 0 },
      { key: 'snap.statusFiguringDish', from: 0.3 },
      { key: 'snap.statusWritingHome', from: 0.62 },
    ];
  }
  return [
    { key: reading, from: 0 },
    { key: 'snap.statusIngredients', from: 0.3 },
    { key: 'snap.statusWritingSteps', from: 0.55 },
    { key: 'snap.statusAlmost', from: 0.8 },
  ];
}

/** The status line for this much progress. Lines go in order and the last one stays; they never loop. */
export function snapStatusKeyAt(lines: SnapStatusLine[], progress: number): string {
  let key = lines[0].key;
  for (const line of lines) if (progress >= line.from) key = line.key;
  return key;
}
