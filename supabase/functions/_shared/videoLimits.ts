/** Max source video length sent to Gemini multimodal (extract + timestamp map). */
export const MAX_VIDEO_DURATION_SECONDS = 180;

export function isVideoTooLong(durationSeconds: number | null | undefined): boolean {
  return (
    typeof durationSeconds === 'number' &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > MAX_VIDEO_DURATION_SECONDS
  );
}

export function formatMaxVideoDurationLabel(): string {
  return '3 minutes';
}

/** Parses YouTube Data API ISO 8601 durations (e.g. PT1M30S, PT45S). */
export function parseYouTubeIsoDuration(iso: string | undefined | null): number | undefined {
  if (!iso || typeof iso !== 'string') return undefined;
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return undefined;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : undefined;
}

/** Values already reported in seconds (YouTube Innertube lengthSeconds, IG video_duration). */
export function parseDurationSeconds(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }
  return undefined;
}

/** Values reported in milliseconds (TikTok aweme, IG clips_metadata). */
export function parseDurationMilliseconds(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw / 1000);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed / 1000);
    }
  }
  return undefined;
}

/**
 * Heuristic for APIs that may return either seconds or milliseconds.
 * Prefer parseDurationSeconds / parseDurationMilliseconds when the unit is known.
 */
export function normalizeDurationSeconds(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    // TikTok aweme_detail.video.duration is milliseconds.
    if (raw > 600) return Math.round(raw / 1000);
    return Math.round(raw);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return normalizeDurationSeconds(parsed);
    }
  }
  return undefined;
}
