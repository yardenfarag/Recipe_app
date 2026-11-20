export type DurationLabels = {
  minutes: string;
  hours: string;
};

const DEFAULT_DURATION_LABELS: DurationLabels = { minutes: 'min', hours: 'hr' };

/**
 * Human-readable recipe time — "25 min", "1 hr", "1 hr 45 min".
 */
export function formatRecipeDuration(
  minutes: number,
  labels: DurationLabels = DEFAULT_DURATION_LABELS,
): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';

  const total = Math.round(minutes);
  const min = labels.minutes;
  const hr = labels.hours;

  if (total < 60) {
    return `${total} ${min}`;
  }

  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  const hrLabel = `${hours} ${hr}`;

  if (remainder === 0) {
    return hrLabel;
  }

  return `${hrLabel} ${remainder} ${min}`;
}
