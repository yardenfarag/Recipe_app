import { supabase } from '@/lib/supabase/client';

export type ActivitySession = {
  sessionId: string;
  userId: string | null;
  email: string | null;
  guestInstallId: string | null;
  platform: string;
  appVersion: string | null;
  startedAt: string;
  lastAt: string;
  screenCount: number;
  tapCount: number;
  /** auth.login, auth.signup, ... seen in this session. */
  authEvents: string[];
};

export type ActivityEvent = {
  id: number;
  kind: 'screen' | 'tap' | 'auth';
  name: string;
  screen: string | null;
  properties: Record<string, unknown>;
  occurredAt: string;
};

export type ActivityTopItem = {
  kind: 'screen' | 'tap' | 'auth';
  name: string;
  count: number;
  people: number;
};

export async function fetchActivitySessions(since: string, search: string): Promise<ActivitySession[]> {
  const { data, error } = await supabase.rpc('admin_interaction_sessions', {
    p_since: since,
    p_search: search.trim() || null,
    p_limit: 100,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    sessionId: String(row.session_id),
    userId: (row.user_id as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    guestInstallId: (row.guest_install_id as string | null) ?? null,
    platform: String(row.platform ?? ''),
    appVersion: (row.app_version as string | null) ?? null,
    startedAt: String(row.started_at),
    lastAt: String(row.last_at),
    screenCount: Number(row.screen_count) || 0,
    tapCount: Number(row.tap_count) || 0,
    authEvents: Array.isArray(row.auth_events) ? (row.auth_events as string[]) : [],
  }));
}

export async function fetchActivitySessionEvents(sessionId: string): Promise<ActivityEvent[]> {
  const { data, error } = await supabase.rpc('admin_interaction_session_events', {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    kind: row.kind as ActivityEvent['kind'],
    name: String(row.name),
    screen: (row.screen as string | null) ?? null,
    properties: (row.properties as Record<string, unknown>) ?? {},
    occurredAt: String(row.occurred_at),
  }));
}

export async function fetchActivityTop(since: string): Promise<ActivityTopItem[]> {
  const { data, error } = await supabase.rpc('admin_interaction_top', { p_since: since, p_limit: 40 });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    kind: row.kind as ActivityTopItem['kind'],
    name: String(row.name),
    count: Number(row.event_count) || 0,
    people: Number(row.people) || 0,
  }));
}
