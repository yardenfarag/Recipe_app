import { useState, type ReactNode } from 'react';

import { deltaOf, humanize } from '@/lib/adminDashboard';

import { Sparkline } from './charts';

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`pd-card ${className}`}>
      {title ? (
        <div className="pd-card-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="pd-card-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A headline number with its change from the previous period. `upIsGood`
 * decides the color: more sign-ups is good, more failures is bad.
 */
export function StatTile({
  label,
  value,
  current,
  previous,
  sub,
  spark,
  upIsGood = true,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
  sub?: string;
  spark?: number[];
  upIsGood?: boolean | null;
}) {
  const delta = deltaOf(current, previous);
  const up = delta.direction === 'up' || delta.direction === 'new';
  const tone =
    delta.direction === 'flat' || upIsGood === null ? 'flat' : up === upIsGood ? 'good' : 'bad';
  const arrow = delta.direction === 'flat' ? '' : up ? '↑' : '↓';
  return (
    <div className="pd-card pd-tile">
      <div className="pd-tile-label">{label}</div>
      <div className="pd-tile-value">{value}</div>
      <div className="pd-delta" data-tone={tone}>
        {arrow ? <span aria-hidden="true">{arrow}</span> : null}
        {delta.text}
      </div>
      {sub ? <div className="pd-tile-sub">{sub}</div> : null}
      {spark ? <Sparkline values={spark} tone={upIsGood === false ? 'bad' : undefined} /> : null}
    </div>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <span className="pd-badge" data-tone={tone}>
      {children}
    </span>
  );
}

export function PersonCell({ email, sub }: { email: string | null; sub?: ReactNode }) {
  const name = email ?? 'No email';
  return (
    <div className="pd-person">
      <div className="pd-avatar" aria-hidden="true">
        {name.slice(0, 1)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="pd-ellipsis" style={{ fontWeight: 600 }}>
          {name}
        </div>
        {sub ? <div className="pd-muted pd-small">{sub}</div> : null}
      </div>
    </div>
  );
}

const PLATFORM_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  web: 'Website',
  photo: 'Photo',
  unknown: 'Unknown',
};

export function platformName(platform: string | null | undefined): string {
  if (!platform) return 'Unknown';
  return PLATFORM_NAMES[platform] ?? humanize(platform);
}

/** Recipe photo, or a plain tile when there is none or it fails to load. */
export function Thumb({ src, className = 'ph' }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={className} aria-hidden="true" />;
  return <img className={className === 'ph' ? undefined : className} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export function Skeleton({ height }: { height: number }) {
  return <div className="pd-skeleton" style={{ height }} />;
}
