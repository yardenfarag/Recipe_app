import {
  featureName,
  formatDate,
  formatUsd,
  modelName,
  num,
  plural,
  rangeLabel,
  type Dashboard,
} from '@/lib/adminDashboard';

import { DailyBars, RankBars } from './charts';
import { Badge, Card, PersonCell, StatTile } from './ui';

const usd = (v: number) => formatUsd(v);
const usdPrecise = (v: number) => formatUsd(v, { precise: true });

export function CostsTab({ data, onOpenPerson }: { data: Dashboard; onOpenPerson: (id: string) => void }) {
  const now = data.kpis.current;
  const before = data.kpis.previous;
  const cost = num(now.ai_cost_usd);
  const revenue = num(now.revenue_usd);
  const admin = num(now.ai_cost_admin_usd);
  const guests = num(now.ai_cost_guest_usd);
  const people = Math.max(0, cost - admin - guests);
  const scrape = num(data.scrape_cost_usd);
  const activePeople = num(now.active_users);
  const topSpenders = [...data.people]
    .filter((p) => num(p.window_ai_cost_usd) > 0)
    .sort((a, b) => num(b.window_ai_cost_usd) - num(a.window_ai_cost_usd))
    .slice(0, 10);

  return (
    <>
      <div className="pd-section pd-grid pd-kpis">
        <StatTile
          label="AI cost"
          value={usd(cost)}
          current={cost}
          previous={before.ai_cost_usd}
          upIsGood={null}
          sub={`${usd(data.totals.ai_cost_usd)} all time`}
          spark={data.daily.map((d) => num(d.ai_cost_usd))}
        />
        <StatTile
          label="Revenue (approx.)"
          value={usd(revenue)}
          current={revenue}
          previous={before.revenue_usd}
          sub={`${usd(data.totals.revenue_usd)} all time · ${data.totals.paying_users} paying`}
          spark={data.daily.map((d) => num(d.revenue_usd))}
        />
        <StatTile
          label="Revenue minus AI cost"
          value={usd(revenue - cost)}
          current={revenue - cost}
          previous={num(before.revenue_usd) - num(before.ai_cost_usd)}
          sub={`${usd(num(data.totals.revenue_usd) - num(data.totals.ai_cost_usd))} all time`}
        />
        <StatTile
          label="Cost per extraction"
          value={num(now.extractions) ? usdPrecise(cost / num(now.extractions)) : '—'}
          current={num(now.extractions) ? cost / num(now.extractions) : 0}
          previous={num(before.extractions) ? num(before.ai_cost_usd) / num(before.extractions) : 0}
          upIsGood={false}
          sub="All AI cost divided by successful extractions"
        />
        <StatTile
          label="Cost per active person"
          value={activePeople ? usdPrecise(cost / activePeople) : '—'}
          current={activePeople ? cost / activePeople : 0}
          previous={num(before.active_users) ? num(before.ai_cost_usd) / num(before.active_users) : 0}
          upIsGood={false}
          sub="Signed-in people only"
        />
      </div>

      <div className="pd-section">
        <Card title="AI cost per day" subtitle="Every model call and scrape, including guests and admins.">
          <DailyBars days={data.daily} metric={{ key: 'ai_cost_usd', label: 'AI cost', format: usd }} />
        </Card>
      </div>

      <div className="pd-section pd-grid pd-2">
        <Card title="Cost by feature" subtitle={`What the money went on in ${rangeLabel(data.range.days)}.`}>
          <RankBars
            items={data.cost_by_action.map((a) => ({
              label: featureName(a.action),
              value: num(a.cost_usd),
              sub: `${plural(a.events, 'run')}${num(a.failed) ? ` · ${a.failed} failed` : ''}`,
            }))}
            format={usdPrecise}
            limit={10}
          />
        </Card>
        <Card title="Cost by model" subtitle="Scraping (ScrapeCreators) is listed separately.">
          <RankBars
            items={[
              ...data.cost_by_model.map((m) => ({
                label: modelName(m.model),
                value: num(m.cost_usd),
                sub: `${plural(m.calls, 'call')} · ${plural(m.tokens, 'token')}`,
              })),
              ...(scrape > 0 ? [{ label: 'Scraping (ScrapeCreators)', value: scrape }] : []),
            ].sort((a, b) => b.value - a.value)}
            format={usdPrecise}
            limit={10}
          />
        </Card>
      </div>

      <div className="pd-section pd-grid pd-2">
        <Card title="Who the cost came from">
          <RankBars
            items={[
              { label: 'Signed-in people', value: people },
              { label: 'Guests (no account)', value: guests },
              { label: 'Admin accounts (testing)', value: admin },
            ]}
            format={usdPrecise}
          />
        </Card>
        <Card title="Biggest AI users" subtitle={`By AI cost in ${rangeLabel(data.range.days)}.`}>
          {topSpenders.length === 0 ? <div className="pd-empty">No signed-in AI use in this period.</div> : null}
          <div className="pd-mini-list">
            {topSpenders.map((p) => (
              <button key={p.id} type="button" className="pd-mini-row" onClick={() => onOpenPerson(p.id)}>
                <div className="grow">
                  <PersonCell email={p.email} sub={`${plural(p.extractions, 'extraction')} · ${plural(p.recipes, 'recipe')}`} />
                </div>
                <strong>{usdPrecise(p.window_ai_cost_usd)}</strong>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="pd-section">
        <Card
          title="Purchases"
          subtitle="Revenue uses the catalog price ($1.99 / $4.99 / $7.99), before store fees and tax. Refunded packs are left out."
        >
          {data.purchases.length === 0 ? (
            <div className="pd-empty">No purchases in this period.</div>
          ) : (
            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Person</th>
                    <th>Pack</th>
                    <th>Store</th>
                    <th className="num">Credits</th>
                    <th className="num">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {data.purchases.map((p) => (
                    <tr key={`${p.created_at}-${p.user_id}`} className="click" onClick={() => onOpenPerson(p.user_id)}>
                      <td>{formatDate(p.created_at, true)}</td>
                      <td>
                        <PersonCell email={p.email} />
                      </td>
                      <td>{p.product_id.replace('pinch_credits_', '') + ' credits'}</td>
                      <td>
                        <Badge>{p.provider === 'revenuecat' ? 'App store' : p.provider === 'polar' ? 'Web (Polar)' : p.provider}</Badge>
                      </td>
                      <td className="num">{p.credits}</td>
                      <td className="num">{usd(p.usd)}</td>
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
