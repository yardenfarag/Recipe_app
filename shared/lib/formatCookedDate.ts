/** Short date for “Last time, Aug 12”. */
export function formatCookedDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
  }
}
