export type StepTimer = {
  /** Whole seconds to count down. */
  seconds: number;
  /** Source snippet shown on the chip, e.g. "10 min". */
  label: string;
};

const BOUNDARY = '(?=\\s|$|[.,!?;:])';

const PATTERNS: { re: RegExp; unitSeconds: number }[] = [
  {
    re: new RegExp(
      `(\\d+(?:[.,]\\d+)?)\\s*(?:hours?|hrs?|hr|horas?|שעות|שעה|часов|часа|час|ساعات|ساعة)${BOUNDARY}`,
      'gi',
    ),
    unitSeconds: 3600,
  },
  {
    re: new RegExp(
      `(\\d+(?:[.,]\\d+)?)\\s*(?:minutes?|mins?|min|minutos?|דקות|דקה|минут[аы]?|минуты|دقائق|دقيقة)${BOUNDARY}`,
      'gi',
    ),
    unitSeconds: 60,
  },
  {
    re: new RegExp(
      `(\\d+(?:[.,]\\d+)?)\\s*(?:seconds?|secs?|sec|segundos?|שניות|שנייה|секунд[аы]?|ثوان|ثانية)${BOUNDARY}`,
      'gi',
    ),
    unitSeconds: 1,
  },
];

function parseCount(raw: string): number | null {
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 24 * 60) return null;
  return n;
}

/** Pull kitchen timers out of a step. Ignores bare numbers (cups, °C, etc.). */
export function parseStepTimers(text: string): StepTimer[] {
  const found: StepTimer[] = [];
  const seen = new Set<string>();

  for (const { re, unitSeconds } of PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) != null) {
      const count = parseCount(match[1] ?? '');
      if (count == null) continue;
      const seconds = Math.round(count * unitSeconds);
      if (seconds < 5 || seconds > 8 * 3600) continue;
      const label = match[0].trim();
      const key = `${seconds}:${label.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ seconds, label });
    }
  }

  return found;
}

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${minutes}:${ss}`;
}
