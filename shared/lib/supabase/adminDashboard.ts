import type { Dashboard, UserDetail } from '../adminDashboard';
import type { DashboardInsights } from '../adminHints';
import { supabase } from './client';

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Everything the dashboard overview shows, bucketed by day in the browser's timezone. */
export async function fetchAdminDashboard(days: number, includeAdmins: boolean): Promise<Dashboard> {
  const { data, error } = await supabase.rpc('admin_dashboard', {
    p_days: days,
    p_tz: browserTimeZone(),
    p_include_admins: includeAdmins,
  });
  if (error) throw error;
  return data as Dashboard;
}

/** Per-platform extraction, Jev gate outcomes, translations and latency, for the dashboard's hints (PIN-49). */
export async function fetchAdminDashboardInsights(days: number, includeAdmins: boolean): Promise<DashboardInsights> {
  const { data, error } = await supabase.rpc('admin_dashboard_insights', {
    p_days: days,
    p_tz: browserTimeZone(),
    p_include_admins: includeAdmins,
  });
  if (error) throw error;
  return data as DashboardInsights;
}

export async function fetchAdminUserDetail(userId: string): Promise<UserDetail> {
  const { data, error } = await supabase.rpc('admin_user_detail', { p_user_id: userId });
  if (error) throw error;
  return data as UserDetail;
}
