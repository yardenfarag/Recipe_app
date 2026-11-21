/**
 * Small formatting rules the admin pages share (activity, usage and support, insights), so the mobile app's admin
 * screens and the new web app's show the same text. Admin pages are English only.
 */
import type { ActivitySession } from './supabase/adminActivity';
import type { Feedback } from './supabase/feedback';

/** Date and time in the admin's own locale and timezone. */
export function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Time of day only, for a session's timeline. */
export function formatClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

/** "45s", "12m", "1h 5m". */
export function formatSessionDuration(fromIso: string, toIso: string): string {
  const seconds = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Who a session belongs to: their email, else their user id, else "Guest" and the start of the install id. */
export function sessionWho(session: Pick<ActivitySession, 'email' | 'userId' | 'guestInstallId'>): string {
  return session.email ?? session.userId ?? `Guest ${session.guestInstallId?.slice(0, 8) ?? ''}`;
}

/** "web 1.0.11": the platform and app version the session was logged with. */
export function sessionPlatform(session: Pick<ActivitySession, 'platform' | 'appVersion'>): string {
  return `${session.platform}${session.appVersion ? ` ${session.appVersion}` : ''}`;
}

/** The first 8 characters of an id, or a dash. */
export function shortId(id: string | null): string {
  if (!id) return '—';
  return id.slice(0, 8);
}

/** Four decimals, for single AI calls: "$0.0123". */
export function usd4(value: number): string {
  return `$${value.toFixed(4)}`;
}

/** An event name in words: "recipe_saved" → "recipe saved". */
export function eventLabel(name: string): string {
  return name.replaceAll('_', ' ');
}

/** Where a piece of feedback came from: form, app version and build, platform, device, OS, language. */
export function feedbackMeta(item: Feedback): string {
  return [
    item.source === 'website' ? 'website form' : null,
    item.app_version ? `v${item.app_version}${item.build_number ? ` (${item.build_number})` : ''}` : null,
    item.platform,
    item.device_model,
    item.os_version,
    item.locale,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Who sent the feedback: their account email, the reply-to address from the website form, or their id. */
export function feedbackSender(item: Feedback): string {
  return item.profile?.email ?? item.contact_email ?? shortId(item.user_id);
}

/**
 * A credit change an admin typed ("+10", "-5", "10"), or null when it isn't a whole number other than zero. As
 * lenient as the mobile screens: it reads the leading whole number, so "10 credits" is 10.
 */
export function parseCreditAmount(text: string): number | null {
  const amount = Number.parseInt(text.trim(), 10);
  return Number.isInteger(amount) && amount !== 0 ? amount : null;
}
