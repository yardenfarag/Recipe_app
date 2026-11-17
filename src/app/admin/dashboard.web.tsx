import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { CostsTab } from '@/components/admin/dashboard/CostsTab';
import { FailuresTab } from '@/components/admin/dashboard/FailuresTab';
import { OverviewTab } from '@/components/admin/dashboard/OverviewTab';
import { PeopleTab } from '@/components/admin/dashboard/PeopleTab';
import { RecipesTab } from '@/components/admin/dashboard/RecipesTab';
import { DASHBOARD_CSS } from '@/components/admin/dashboard/styles';
import { Skeleton } from '@/components/admin/dashboard/ui';
import { UserDrawer } from '@/components/admin/dashboard/UserDrawer';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { DASHBOARD_RANGES, formatDate, num, relativeTime, type Dashboard } from '@/lib/adminDashboard';
import { errorText } from '@/lib/errorText';
import { fetchAdminDashboard } from '@/lib/supabase/adminDashboard';

type Tab = 'overview' | 'people' | 'recipes' | 'costs' | 'failures';
const PREFS_KEY = 'pinch.adminDashboard';

function readPrefs(): { days?: number; includeAdmins?: boolean } {
  try {
    return JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function writePrefs(prefs: { days: number; includeAdmins: boolean }) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private windows can block storage; the defaults are fine.
  }
}

/** Web-only admin dashboard: who signed up, what they cooked, what AI cost, what sold. */
export default function AdminDashboardScreen() {
  const { scheme } = useThemePreference();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: profileLoading } = useProfile();

  useEffect(() => {
    if (typeof document !== 'undefined') document.title = 'Pinch admin';
  }, []);

  let body;
  if (authLoading || (user && profileLoading)) {
    body = (
      <div className="pd-center">
        <p>Checking your account…</p>
      </div>
    );
  } else if (!user) {
    body = (
      <div className="pd-center">
        <div>
          <h2>Sign in to see the dashboard</h2>
          <p>Use your admin account.</p>
          <button type="button" className="pd-btn" onClick={() => router.push('/auth?mode=signin')}>
            Sign in
          </button>
        </div>
      </div>
    );
  } else if (!isAdmin) {
    body = (
      <div className="pd-center">
        <div>
          <h2>Admins only</h2>
          <p>{user.email} doesn’t have admin access.</p>
          <button type="button" className="pd-btn" onClick={() => router.replace('/')}>
            Back to Pinch
          </button>
        </div>
      </div>
    );
  } else {
    body = <DashboardBody />;
  }

  return (
    <div className="pd" data-scheme={scheme === 'dark' ? 'dark' : 'light'}>
      <style>{DASHBOARD_CSS}</style>
      {body}
    </div>
  );
}

function DashboardBody() {
  const [days, setDays] = useState<number>(() => readPrefs().days ?? 30);
  const [includeAdmins, setIncludeAdmins] = useState<boolean>(() => readPrefs().includeAdmins ?? false);
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAdminDashboard(days, includeAdmins));
    } catch (err) {
      setError(errorText(err, 'Could not load the dashboard.'));
    } finally {
      setLoading(false);
    }
  }, [days, includeAdmins]);

  useEffect(() => {
    void load();
    writePrefs({ days, includeAdmins });
  }, [load, days, includeAdmins]);

  const closePerson = useCallback(() => setPersonId(null), []);
  const failures = data ? num(data.kpis.current.extraction_failures) : 0;
  const since = data ? new Date(data.range.since).getTime() : 0;
  const newPeople = data ? data.people.filter((p) => new Date(p.created_at).getTime() >= since).length : 0;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'people', label: 'People', count: newPeople || undefined },
    { key: 'recipes', label: 'Recipes', count: data?.recent_recipes.length || undefined },
    { key: 'costs', label: 'Costs & revenue' },
    { key: 'failures', label: 'Failures', count: failures || undefined },
  ];

  return (
    <>
      <header className="pd-top">
        <div className="pd-top-inner">
          <div className="pd-titlebar">
            <div className="pd-brand">
              <h1>Pinch admin</h1>
              <span>
                {data ? `Updated ${relativeTime(data.range.generated_at)} · days in ${data.range.tz}` : 'Loading…'}
              </span>
            </div>
            <div className="pd-controls">
              <div className="pd-seg" role="group" aria-label="Time range">
                {DASHBOARD_RANGES.map((r) => (
                  <button key={r.days} type="button" aria-pressed={days === r.days} onClick={() => setDays(r.days)}>
                    {r.label}
                  </button>
                ))}
              </div>
              <label className="pd-check" title="Your own and other admin accounts. AI cost always includes them.">
                <input type="checkbox" checked={includeAdmins} onChange={(e) => setIncludeAdmins(e.target.checked)} />
                Include admin accounts
              </label>
              <button type="button" className="pd-btn" onClick={() => void load()} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </button>
              <button type="button" className="pd-btn" onClick={() => router.push('/settings')}>
                Open app
              </button>
            </div>
          </div>
          <nav className="pd-tabs" role="tablist" aria-label="Dashboard sections">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label}
                {t.count ? <span className="pd-count">{t.count}</span> : null}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="pd-wrap">
        {error ? <div className="pd-error">{error}</div> : null}
        {!data && loading ? (
          <div className="pd-section pd-grid" style={{ gap: 16 }}>
            <Skeleton height={180} />
            <Skeleton height={120} />
            <Skeleton height={280} />
          </div>
        ) : null}
        {data ? (
          <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
            {tab === 'overview' ? (
              <OverviewTab data={data} onOpenPerson={setPersonId} onShowTab={setTab} />
            ) : null}
            {tab === 'people' ? <PeopleTab data={data} onOpenPerson={setPersonId} /> : null}
            {tab === 'recipes' ? <RecipesTab data={data} onOpenPerson={setPersonId} /> : null}
            {tab === 'costs' ? <CostsTab data={data} onOpenPerson={setPersonId} /> : null}
            {tab === 'failures' ? <FailuresTab data={data} onOpenPerson={setPersonId} /> : null}
            <p className="pd-foot">
              Showing {formatDate(data.range.since)} to today
              {data.range.include_admins ? ', including admin accounts' : ', without admin accounts (AI cost still includes them)'}.
              “Before” compares with the {data.range.days} days just before that. Revenue is approximate: catalog
              prices before store fees and tax.
            </p>
          </div>
        ) : null}
      </main>

      {personId ? <UserDrawer userId={personId} onClose={closePerson} /> : null}
    </>
  );
}
