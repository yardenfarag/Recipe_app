/**
 * Human-readable recipe time — "25 min", "1 hr", "1 hr 45 min".
 */
export function formatRecipeDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';

  const total = Math.round(minutes);

  if (total < 60) {
    return `${total} min`;
  }

  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  const hrLabel = hours === 1 ? '1 hr' : `${hours} hr`;

  if (remainder === 0) {
    return hrLabel;
  }

  return `${hrLabel} ${remainder} min`;
}
