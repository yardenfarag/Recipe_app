import { useState } from 'react';

import {
  buildHighlights,
  countryName,
  formatCount,
  formatPercent,
  formatUsd,
  humanize,
  num,
  plural,
  rangeLabel,
  relativeTime,
  summarizeTraffic,
  type Dashboard,
} from '@/lib/adminDashboard';

import { DailyBars, Funnel, RankBars, type DayMetric } from './charts';
import { Card, PersonCell, StatTile, Thumb, platformName } from './ui';

const DAY_METRICS: DayMetric[] = [
  { key: 'signups', label: 'New sign-ups', format: formatCount },
  { key: 'active_users', label: 'Active people', format: formatCount },
  { key: 'recipes', label: 'Recipes saved', format: formatCount },
  { key: 'extractions', label: 'Extractions', format: formatCount },
  { key: 'failures', label: 'Failed extractions', format: formatCount, tone: 'bad' },
  { key: 'ai_cost_usd', label: 'AI cost', format: (v) => formatUsd(v) },
  { key: 'revenue_usd', label: 'Revenue', format: (v) => formatUsd(v) },
];

export function OverviewTab({
  data,
  onOpenPerson,
  onShowTab,
}: {
  data: Dashboard;
  onOpenPerson: (id: string) => void;
  onShowTab: (tab: 'people' | 'recipes') => void;
}) {
  const [metricKey, setMetricKey] = useState<DayMetric['key']>('signups');
  const metric = DAY_METRICS.find((m) => m.key === metricKey) ?? DAY_METRICS[0];
  const now = data.kpis.current;
  const before = data.kpis.previous;
  const series = (key: DayMetric['key']) => data.daily.map((d) => num(d[key]));
  const attempts = num(now.extractions) + num(now.extraction_failures);
  const highlights = buildHighlights(data);
  const since = new Date(data.range.since).getTime();
  const newcomers = data.people.filter((p) => new Date(p.created_at).getTime() >= since);
  const newest = newcomers.slice(0, 6);
  const f = data.funnel;
  const traffic = summarizeTraffic(data.traffic ?? []);

  return (
    <>
      <div className="pd-section pd-grid pd-main-side">
        <Card title={`What happened in ${rangeLabel(data.range.days)}`} subtitle="Compared with the period just before it.">
          <ul className="pd-highlights">
            {highlights.map((h) => (
              <li key={h.text}>
                <span className="pd-dot" data-tone={h.tone} aria-hidden="true">
                  {h.tone === 'good' ? '↑' : h.tone === 'bad' ? '!' : '•'}
                </span>
                <span>{h.text}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="New people: how far they got" subtitle={`Everyone who signed up in ${rangeLabel(data.range.days)}.`}>
          <Funnel
            steps={[
              { label: 'Signed up', count: num(f.signed_up) },
              { label: 'Extracted a recipe', count: num(f.extracted) },
              { label: 'Saved a recipe', count: num(f.saved) },
              { label: 'Saved 3+ recipes', count: num(f.saved_3) },
              { label: 'Bought credits', count: num(f.purchased) },
            ]}
          />
        </Card>
      </div>

      <div className="pd-section pd-grid pd-kpis">
        <StatTile
          label="New sign-ups"
          value={formatCount(now.new_users)}
          current={now.new_users}
          previous={before.new_users}
          sub={`${formatCount(data.totals.users)} accounts in total`}
          spark={series('signups')}
        />
        <StatTile
          label="Active people"
          value={formatCount(now.active_users)}
          current={now.active_users}
          previous={before.active_users}
          sub={`plus ${formatCount(now.active_guests)} guests without an account`}
          spark={series('active_users')}
        />
        <StatTile
          label="Recipes saved"
          value={formatCount(now.recipes_saved)}
          current={now.recipes_saved}
          previous={before.recipes_saved}
          sub={`${formatCount(data.totals.recipes)} recipes in total`}
          spark={series('recipes')}
        />
        <StatTile
          label="Extractions"
          value={formatCount(now.extractions)}
          current={now.extractions}
          previous={before.extractions}
          sub={`${formatCount(now.extraction_failures)} failed (${formatPercent(now.extraction_failures, attempts)})`}
          spark={series('extractions')}
        />
        <StatTile
          label="AI cost"
          value={formatUsd(now.ai_cost_usd)}
          current={now.ai_cost_usd}
          previous={before.ai_cost_usd}
          upIsGood={null}
          sub={
            num(now.extractions)
              ? `${formatUsd(num(now.ai_cost_usd) / num(now.extractions), { precise: true })} per extraction`
              : `${formatUsd(data.totals.ai_cost_usd)} all time`
          }
          spark={series('ai_cost_usd')}
        />
        <StatTile
          label="Revenue (approx.)"
          value={formatUsd(now.revenue_usd)}
          current={now.revenue_usd}
          previous={before.revenue_usd}
          sub={`${formatCount(now.purchases)} packs · ${formatCount(now.credits_sold)} credits`}
          spark={series('revenue_usd')}
        />
      </div>

      <div className="pd-section">
        <Card
          title={`${metric.label} per day`}
          subtitle="Hover a bar for the exact number."
          actions={
            <div className="pd-seg" role="group" aria-label="Metric">
              {DAY_METRICS.map((m) => (
                <button key={m.key} type="button" aria-pressed={m.key === metricKey} onClick={() => setMetricKey(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
          }
        >
          <DailyBars days={data.daily} metric={metric} />
        </Card>
      </div>

      <div className="pd-section pd-grid pd-3">
        <Card
          title="Newest people"
          actions={
            <button type="button" className="pd-btn" onClick={() => onShowTab('people')}>
              All people
            </button>
          }
        >
          {newest.length === 0 ? <div className="pd-empty">No sign-ups in this period.</div> : null}
          <div className="pd-mini-list">
            {newest.map((p) => (
              <button key={p.id} type="button" className="pd-mini-row" onClick={() => onOpenPerson(p.id)}>
                <div className="grow">
                  <PersonCell
                    email={p.email}
                    sub={`Joined ${relativeTime(p.created_at)} · ${plural(p.recipes, 'recipe')}${p.country ? ` · ${countryName(p.country)}` : ''}`}
                  />
                </div>
              </button>
            ))}
          </div>
        </Card>
        <Card
          title="Latest recipes"
          actions={
            <button type="button" className="pd-btn" onClick={() => onShowTab('recipes')}>
              All recipes
            </button>
          }
        >
          {data.recent_recipes.length === 0 ? <div className="pd-empty">No recipes saved in this period.</div> : null}
          <div className="pd-mini-list">
            {data.recent_recipes.slice(0, 6).map((r) => (
              <button key={r.id} type="button" className="pd-mini-row" onClick={() => onOpenPerson(r.user_id)}>
                <Thumb src={r.image_url} />
                <div className="grow">
                  <div className="t">{r.title || 'Untitled recipe'}</div>
                  <div className="pd-muted pd-small pd-ellipsis">
                    {platformName(r.platform)} · {r.email ?? 'unknown'} · {relativeTime(r.created_at)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Where recipes come from" subtitle="Recipes saved in this period.">
          <RankBars
            items={data.recipes_by_platform.map((r) => ({ label: platformName(r.label), value: num(r.count) }))}
            format={formatCount}
            empty="No recipes saved in this period."
          />
          <div style={{ height: 18 }} />
          <div className="pd-muted pd-small" style={{ marginBottom: 8 }}>
            Where in the post the recipe was found
          </div>
          <RankBars
            items={data.recipes_by_source.map((r) => ({ label: humanize(r.label), value: num(r.count) }))}
            format={formatCount}
            empty=""
          />
        </Card>
      </div>

      <div className="pd-section">
        <Card
          title="Where website visitors come from"
          subtitle="Visits to pinch-app.io (home page and guides). ChatGPT tags its links; other sites are known from the referrer, which is recorded from Nov 17, 2026. Older untagged visits show as direct or unknown."
        >
          <div className="pd-grid pd-2" style={{ gap: 28 }}>
            <div>
              <div className="pd-muted pd-small" style={{ marginBottom: 8 }}>
                By kind · {formatCount(traffic.totalVisits)} visits
              </div>
              <RankBars
                items={traffic.groups.map((g) => ({
                  label: g.label,
                  value: g.visits,
                  sub: formatPercent(g.visits, traffic.totalVisits),
                }))}
                format={formatCount}
                empty="No website visits in this period."
              />
            </div>
            <div>
              <div className="pd-muted pd-small" style={{ marginBottom: 8 }}>
                By site · people who then tapped a store or web-app button
              </div>
              <RankBars
                items={traffic.sources.map((s) => ({
                  label: s.label,
                  value: s.visits,
                  sub: `${plural(s.visitors, 'person', 'people')} · ${formatCount(s.clicked)} tapped`,
                }))}
                format={formatCount}
                empty="No website visits in this period."
                limit={10}
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="pd-section pd-grid pd-2">
        <Card title="Where new people are from" subtitle="Country of their latest app event.">
          <RankBars items={countryCounts(newcomers.map((p) => p.country))} format={formatCount} empty="No sign-ups in this period." />
        </Card>
        <Card
          title="How people heard about Pinch"
          subtitle="All onboarding answers, including from guests who never made an account. The People tab shows the answer behind each new account."
        >
          <RankBars
            items={data.heard_about.map((h) => ({ label: humanize(h.label), value: num(h.count) }))}
            format={formatCount}
            empty="No answers in this period."
          />
        </Card>
      </div>
    </>
  );
}

function countryCounts(codes: (string | null)[]) {
  const counts = new Map<string, number>();
  for (const code of codes) {
    const name = code ? countryName(code) : 'Unknown';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
