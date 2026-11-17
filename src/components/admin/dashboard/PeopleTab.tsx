import { useMemo, useState } from 'react';

import {
  countryName,
  deviceName,
  formatDate,
  formatUsd,
  num,
  relativeTime,
  sortPeople,
  type Dashboard,
  type PersonSort,
} from '@/lib/adminDashboard';

import { Badge, Card, PersonCell } from './ui';

type Filter = 'new' | 'all' | 'active' | 'paying' | 'stuck';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'new', label: 'New in period' },
  { key: 'all', label: 'Everyone' },
  { key: 'active', label: 'Active in period' },
  { key: 'paying', label: 'Paid' },
  { key: 'stuck', label: 'Never extracted' },
];

const COLUMNS: { key: PersonSort | null; label: string; num?: boolean }[] = [
  { key: 'created_at', label: 'Person · joined' },
  { key: 'last_active_at', label: 'Last active' },
  { key: 'recipes', label: 'Recipes', num: true },
  { key: 'extractions', label: 'Extractions', num: true },
  { key: 'ai_cost_usd', label: 'AI cost', num: true },
  { key: 'spent_usd', label: 'Paid', num: true },
  { key: null, label: 'Country' },
  { key: null, label: 'Device' },
];

export function PeopleTab({ data, onOpenPerson }: { data: Dashboard; onOpenPerson: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>('new');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<PersonSort>('created_at');
  const since = new Date(data.range.since).getTime();

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = data.people.filter((p) => {
      if (needle && !(p.email ?? '').toLowerCase().includes(needle) && !p.id.startsWith(needle)) return false;
      if (filter === 'new') return new Date(p.created_at).getTime() >= since;
      if (filter === 'active') return !!p.last_active_at && new Date(p.last_active_at).getTime() >= since;
      if (filter === 'paying') return num(p.credits_bought) > 0;
      if (filter === 'stuck') return num(p.extractions) === 0;
      return true;
    });
    return sortPeople(filtered, sort);
  }, [data.people, filter, query, sort, since]);

  const counts: Record<Filter, number> = {
    new: data.people.filter((p) => new Date(p.created_at).getTime() >= since).length,
    all: data.people.length,
    active: data.people.filter((p) => !!p.last_active_at && new Date(p.last_active_at).getTime() >= since).length,
    paying: data.people.filter((p) => num(p.credits_bought) > 0).length,
    stuck: data.people.filter((p) => num(p.extractions) === 0).length,
  };

  return (
    <div className="pd-section">
      <Card
        title="People"
        subtitle="Click anyone to see their recipes, AI use and purchases. Numbers are all-time unless noted."
        actions={
          <input
            className="pd-search"
            type="search"
            placeholder="Search by email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search people by email"
          />
        }
      >
        <div className="pd-seg" role="group" aria-label="Filter people" style={{ marginBottom: 14 }}>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} <span className="pd-muted">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <div className="pd-empty">Nobody matches.</div>
        ) : (
          <div className="pd-table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.label} className={c.num ? 'num' : undefined}>
                      {c.key ? (
                        <button type="button" aria-pressed={sort === c.key} onClick={() => setSort(c.key as PersonSort)}>
                          {c.label}
                          {sort === c.key ? ' ↓' : ''}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="click" onClick={() => onOpenPerson(p.id)}>
                    <td>
                      <PersonCell
                        email={p.email}
                        sub={
                          <>
                            {formatDate(p.created_at)} · {relativeTime(p.created_at)}
                            {p.is_admin ? (
                              <>
                                {' '}
                                <Badge>admin</Badge>
                              </>
                            ) : null}
                          </>
                        }
                      />
                    </td>
                    <td className="pd-muted">{relativeTime(p.last_active_at)}</td>
                    <td className="num">
                      {p.recipes}
                      {num(p.window_recipes) > 0 ? <div className="pd-muted pd-small">+{p.window_recipes} in period</div> : null}
                    </td>
                    <td className="num">
                      {p.extractions}
                      {num(p.failures) > 0 ? <div className="pd-small" style={{ color: 'var(--bad)' }}>{p.failures} failed</div> : null}
                    </td>
                    <td className="num">{formatUsd(p.ai_cost_usd)}</td>
                    <td className="num">
                      {num(p.spent_usd) > 0 ? <Badge tone="good">{formatUsd(p.spent_usd)}</Badge> : <span className="pd-muted">—</span>}
                    </td>
                    <td>{countryName(p.country)}</td>
                    <td>{deviceName(p.platform)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
