/**
 * Small pure helpers for the mobile household screens (docs/adr/034-households.md). The household rules both apps
 * share are in shared/lib/household.ts; these only format and lay things out for this app.
 */

/** "3 Dec" in the app language, for "Joined …" and "The link works until …". */
export function formatShortDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString(language, { day: 'numeric', month: 'short' });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * When "I'm going shopping" can be sent again, as words for "You can send it again {{when}}": "in 19 hours" where
 * the engine has Intl.RelativeTimeFormat, else the day and time ("Thu 09:30"; Hermes has no RelativeTimeFormat).
 */
export function formatSendAgain(at: Date, now: Date, language: string): string {
  const minutes = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 60_000));
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function') {
      const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'always' });
      return minutes < 60 ? rtf.format(minutes, 'minute') : rtf.format(Math.round(minutes / 60), 'hour');
    }
  } catch {
    // Fall through to the day and time.
  }
  try {
    return at.toLocaleString(language, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

/** "Dana, Avi and Noa" in the app language where Intl.ListFormat exists, else joined with commas. */
export function joinNames(names: string[], language: string): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  try {
    if (typeof Intl !== 'undefined' && typeof (Intl as { ListFormat?: unknown }).ListFormat === 'function') {
      const ListFormat = (Intl as unknown as {
        ListFormat: new (lang: string, options: { style: string; type: string }) => { format(list: string[]): string };
      }).ListFormat;
      return new ListFormat(language, { style: 'long', type: 'conjunction' }).format(clean);
    }
  } catch {
    // Fall through.
  }
  return clean.join(', ');
}

/** The first `max` people for an avatar stack, and how many more there are ("+2"). */
export function stackMembers<T>(members: readonly T[], max: number): { shown: T[]; extra: number } {
  const limit = Math.max(0, max);
  if (members.length <= limit) return { shown: [...members], extra: 0 };
  // Keep a slot for the "+N" bubble.
  const shown = members.slice(0, Math.max(0, limit - 1));
  return { shown, extra: members.length - shown.length };
}

/** The WhatsApp app link and the web fallback for sending `text`. */
export function whatsappUrls(text: string): { app: string; web: string } {
  const encoded = encodeURIComponent(text);
  return { app: `whatsapp://send?text=${encoded}`, web: `https://wa.me/?text=${encoded}` };
}

/** True when an invite's `expiresAt` has passed (or can't be read). */
export function inviteExpired(expiresAt: string, now: Date = new Date()): boolean {
  const at = new Date(expiresAt).getTime();
  return Number.isNaN(at) || at <= now.getTime();
}
