import { DASHBOARD_RANGES } from "@shared/lib/adminDashboard";

/** The dashboard's range and "include admin accounts", kept in this browser (the same key the Expo web app used). */
export const DASHBOARD_PREFS_KEY = "pinch.adminDashboard";

export type DashboardPrefs = { days: number; includeAdmins: boolean };

const DEFAULTS: DashboardPrefs = { days: 30, includeAdmins: false };

export function readDashboardPrefs(): DashboardPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(DASHBOARD_PREFS_KEY) ?? "{}") as Partial<DashboardPrefs> | null;
    const days = DASHBOARD_RANGES.some((r) => r.days === raw?.days) ? (raw!.days as number) : DEFAULTS.days;
    return { days, includeAdmins: raw?.includeAdmins === true };
  } catch {
    return DEFAULTS;
  }
}

export function writeDashboardPrefs(prefs: DashboardPrefs): void {
  try {
    window.localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private windows can block storage; the defaults are fine.
  }
}
