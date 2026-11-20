import { useEffect, useMemo, useState } from 'react';

import {
  featureName,
  formatCount,
  formatDate,
  formatUsd,
  humanize,
  num,
  relativeTime,
  type UserDetail,
} from '@shared/lib/adminDashboard';
import { errorText } from '@shared/lib/errorText';
import { fetchAdminUserDetail } from '@shared/lib/supabase/adminDashboard';

import { Badge, Card, Skeleton, Thumb, platformName } from './ui';

type TimelineItem = { when: string; text: string; detail?: string; tone?: 'bad' | 'muted'; cost?: number };

const FAILED = new Set(['error', 'failed', 'metering_error']);

function eventDetail(properties: Record<string, unknown>): string {
  const parts = ['source', 'from', 'trigger', 'mode', 'platform', 'locale', 'outcome', 'action']
    .map((key) => properties?.[key])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return parts.join(' · ');
}

function buildTimeline(detail: UserDetail): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const r of detail.recipes) {
    items.push({ when: r.created_at, text: `Saved “${r.title || 'Untitled recipe'}”`, detail: platformName(r.platform) });
  }
  for (const e of detail.ai_events) {
    const failed = FAILED.has(e.status);
    items.push({
      when: e.created_at,
      text: `${featureName(e.action)} · ${humanize(e.status).toLowerCase()}`,
      detail: [e.platform ? platformName(e.platform) : null, e.message].filter(Boolean).join(' · ') || undefined,
      tone: failed ? 'bad' : e.action.endsWith('_gate') ? 'muted' : undefined,
      cost: num(e.cost_usd),
    });
  }
  for (const e of detail.events) {
    items.push({ when: e.created_at, text: humanize(e.name), detail: eventDetail(e.properties) || undefined, tone: 'muted' });
  }
  for (const p of detail.purchases) {
    items.push({
      when: p.created_at,
      text: `Bought ${p.credits} credits${p.revoked_at ? ' (refunded)' : ''}`,
      detail: p.provider === 'revenuecat' ? 'App store' : p.provider,
    });
  }
  return items.sort((a, b) => b.when.localeCompare(a.when)).slice(0, 200);
}

export function UserDrawer({
  userId,
  onClose,
  load = fetchAdminUserDetail,
}: {
  userId: string;
  onClose: () => void;
  load?: (userId: string) => Promise<UserDetail>;
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    load(userId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Could not load this person.'));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const timeline = useMemo(() => (detail ? buildTimeline(detail) : []), [detail]);
  const stats = useMemo(() => {
    if (!detail) return null;
    return {
      extractions: num(detail.profile.extractions),
      failures: num(detail.profile.failures),
      cost: num(detail.profile.ai_cost_usd),
      bought: detail.purchases.filter((p) => !p.revoked_at).reduce((sum, p) => sum + num(p.credits), 0),
      lastActive: timeline[0]?.when ?? null,
      cooked: detail.recipes.filter((r) => r.last_cooked_at).length,
    };
  }, [detail, timeline]);

  return (
    <>
      <div className="pd-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="pd-drawer" role="dialog" aria-modal="true" aria-label="Person details">
        <div className="pd-drawer-head">
          <div className="pd-avatar" aria-hidden="true">
            {(detail?.profile.email ?? '?').slice(0, 1)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2>{detail?.profile.email ?? (error ? 'Person' : 'Loading…')}</h2>
            {detail ? (
              <div className="pd-muted pd-small">
                Joined {formatDate(detail.profile.created_at, true)} ({relativeTime(detail.profile.created_at)}) · last active{' '}
                {relativeTime(stats?.lastActive)}
                {detail.profile.is_admin ? (
                  <>
                    {' '}
                    <Badge>admin</Badge>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <button type="button" className="pd-btn" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div className="pd-drawer-body">
          {error ? <div className="pd-error">{error}</div> : null}
          {!detail && !error ? (
            <>
              <Skeleton height={90} />
              <Skeleton height={240} />
              <Skeleton height={320} />
            </>
          ) : null}
          {detail && stats ? (
            <>
              <div className="pd-facts">
                <Fact label="Recipes" value={formatCount(detail.recipes.length)} />
                <Fact label="Extractions" value={formatCount(stats.extractions)} />
                <Fact label="Failed" value={formatCount(stats.failures)} />
                <Fact label="AI cost" value={formatUsd(stats.cost)} />
                <Fact label="Credits bought" value={formatCount(stats.bought)} />
                <Fact label="Credit balance" value={formatCount(detail.profile.token_balance)} />
                <Fact label="Free extracts this month" value={formatCount(detail.profile.free_extracts_this_month)} />
                <Fact label="Recipes cooked" value={formatCount(stats.cooked)} />
              </div>

              <Card title={`Recipes (${detail.recipes.length})`}>
                {detail.recipes.length === 0 ? <div className="pd-empty">No saved recipes.</div> : null}
                <div className="pd-mini-list">
                  {detail.recipes.map((r) => (
                    <div key={r.id} className="pd-mini-row">
                      <Thumb src={r.image_url} />
                      <div className="grow">
                        <div className="t">{r.title || 'Untitled recipe'}</div>
                        <div className="pd-muted pd-small">
                          {platformName(r.platform)} · {formatDate(r.created_at)}
                          {r.minutes ? ` · ${r.minutes} min` : ''}
                          {r.ingredients ? ` · ${r.ingredients} ingredients` : ''}
                          {r.is_favorite ? ' · ♥' : ''}
                          {r.last_cooked_at ? ' · cooked' : ''}
                        </div>
                      </div>
                      {r.url ? (
                        <a className="pd-small" href={r.url} target="_blank" rel="noreferrer noopener">
                          Source ↗
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Everything they did" subtitle="Newest first. Grey rows are app events and background checks.">
                {timeline.length === 0 ? <div className="pd-empty">No activity recorded.</div> : null}
                <ul className="pd-timeline">
                  {timeline.map((item, i) => (
                    <li key={`${item.when}-${i}`}>
                      <span className="when">{formatDate(item.when, true)}</span>
                      <span className="pip" data-tone={item.tone} aria-hidden="true" />
                      <span style={{ minWidth: 0 }}>
                        <span style={item.tone === 'muted' ? { color: 'var(--text-2)' } : undefined}>{item.text}</span>
                        {item.detail ? <div className="pd-muted pd-small">{item.detail}</div> : null}
                      </span>
                      <span className="pd-muted pd-small">{item.cost ? formatUsd(item.cost, { precise: true }) : ''}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="pd-fact">
      <div>{label}</div>
      <div>{value}</div>
    </div>
  );
}
