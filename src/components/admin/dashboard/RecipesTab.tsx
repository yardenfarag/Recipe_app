import { useMemo, useState } from 'react';

import { formatDate, humanize, rangeLabel, type Dashboard } from '@shared/lib/adminDashboard';

import { Badge, Card, Thumb, platformName } from './ui';

export function RecipesTab({ data, onOpenPerson }: { data: Dashboard; onOpenPerson: (id: string) => void }) {
  const [platform, setPlatform] = useState<string>('all');
  const [query, setQuery] = useState('');

  const platforms = useMemo(
    () => ['all', ...data.recipes_by_platform.map((p) => p.label)],
    [data.recipes_by_platform],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.recent_recipes.filter((r) => {
      if (platform !== 'all' && (r.platform || 'unknown') !== platform) return false;
      if (!needle) return true;
      return (r.title ?? '').toLowerCase().includes(needle) || (r.email ?? '').toLowerCase().includes(needle);
    });
  }, [data.recent_recipes, platform, query]);

  return (
    <div className="pd-section">
      <Card
        title="Recipes saved"
        subtitle={`Newest first, from ${rangeLabel(data.range.days)} (up to 150).`}
        actions={
          <input
            className="pd-search"
            type="search"
            placeholder="Search title or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search recipes"
          />
        }
      >
        <div className="pd-seg" role="group" aria-label="Filter by platform">
          {platforms.map((p) => (
            <button key={p} type="button" aria-pressed={platform === p} onClick={() => setPlatform(p)}>
              {p === 'all' ? 'All' : platformName(p)}
            </button>
          ))}
        </div>
      </Card>

      {rows.length === 0 ? (
        <div className="pd-empty" style={{ marginTop: 16 }}>
          No recipes match.
        </div>
      ) : (
        <div className="pd-recipes" style={{ marginTop: 16 }}>
          {rows.map((r) => (
            <article key={r.id} className="pd-recipe">
              <Thumb src={r.image_url} className="pd-recipe-img" />
              <div className="pd-recipe-body">
                <div className="pd-recipe-title">{r.title || 'Untitled recipe'}</div>
                <div className="pd-recipe-meta">
                  <Badge>{platformName(r.platform)}</Badge>
                  {r.source ? <span>from {humanize(r.source).toLowerCase()}</span> : null}
                  {r.status && r.status !== 'full' ? <Badge tone="bad">{humanize(r.status)}</Badge> : null}
                </div>
                <div className="pd-recipe-meta" style={{ marginTop: 'auto' }}>
                  <button type="button" className="pd-linkish pd-ellipsis" onClick={() => onOpenPerson(r.user_id)}>
                    {r.email ?? 'unknown'}
                  </button>
                </div>
                <div className="pd-recipe-meta">
                  <span>{formatDate(r.created_at, true)}</span>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer noopener">
                      Source ↗
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
