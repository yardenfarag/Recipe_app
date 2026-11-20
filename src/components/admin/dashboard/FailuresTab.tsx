import {
  featureName,
  formatCount,
  formatDate,
  formatPercent,
  humanize,
  num,
  rangeLabel,
  type Dashboard,
} from '@shared/lib/adminDashboard';

import { DailyBars, RankBars } from './charts';
import { Badge, Card, PersonCell, StatTile, platformName } from './ui';

export function FailuresTab({ data, onOpenPerson }: { data: Dashboard; onOpenPerson: (id: string) => void }) {
  const now = data.kpis.current;
  const before = data.kpis.previous;
  const attempts = num(now.extractions) + num(now.extraction_failures);
  const prevAttempts = num(before.extractions) + num(before.extraction_failures);
  const rate = attempts ? num(now.extraction_failures) / attempts : 0;
  const prevRate = prevAttempts ? num(before.extraction_failures) / prevAttempts : 0;
  const byFeature = data.cost_by_action
    .filter((a) => num(a.failed) > 0)
    .map((a) => ({ label: featureName(a.action), value: num(a.failed), sub: `of ${formatCount(a.events)}` }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <div className="pd-section pd-grid pd-kpis">
        <StatTile
          label="Failed extractions"
          value={formatCount(now.extraction_failures)}
          current={now.extraction_failures}
          previous={before.extraction_failures}
          upIsGood={false}
          sub={`out of ${formatCount(attempts)} attempts`}
          spark={data.daily.map((d) => num(d.failures))}
        />
        <StatTile
          label="Failure rate"
          value={formatPercent(now.extraction_failures, attempts)}
          current={Math.round(rate * 1000)}
          previous={Math.round(prevRate * 1000)}
          upIsGood={false}
          sub={`${formatPercent(before.extraction_failures, prevAttempts)} the period before`}
        />
      </div>

      <div className="pd-section pd-grid pd-main-side">
        <Card title="Failed extractions per day">
          <DailyBars
            days={data.daily}
            metric={{ key: 'failures', label: 'Failed extractions', format: formatCount, tone: 'bad' }}
            height={200}
          />
        </Card>
        <Card title="Failures by feature" subtitle="Every AI feature, not only extraction.">
          <RankBars items={byFeature} format={formatCount} tone="bad" empty="No failures in this period." />
        </Card>
      </div>

      <div className="pd-section">
        <Card title="Latest problems" subtitle={`The newest 40 from ${rangeLabel(data.range.days)}, including rejected (non-food) posts.`}>
          {data.recent_failures.length === 0 ? (
            <div className="pd-empty">Nothing went wrong in this period.</div>
          ) : (
            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Feature</th>
                    <th>Result</th>
                    <th>Where</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_failures.map((f, i) => (
                    <tr
                      key={`${f.created_at}-${i}`}
                      className={f.user_id ? 'click' : undefined}
                      onClick={f.user_id ? () => onOpenPerson(f.user_id as string) : undefined}
                    >
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(f.created_at, true)}</td>
                      <td>{f.guest ? <span className="pd-muted">Guest</span> : <PersonCell email={f.email} />}</td>
                      <td>{featureName(f.action)}</td>
                      <td>
                        <Badge tone={f.status === 'rejected' ? undefined : 'bad'}>{humanize(f.status)}</Badge>
                      </td>
                      <td>
                        {[f.platform ? platformName(f.platform) : null, f.source ? humanize(f.source) : null]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                      <td className="pd-small" style={{ maxWidth: 420 }}>
                        {f.message || <span className="pd-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
