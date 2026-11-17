/**
 * Plain CSS for the web-only admin dashboard. It renders DOM elements, not
 * React Native views, so it carries its own tokens. Light and dark values are
 * picked by `data-scheme` on the root, which follows the app's theme setting.
 * Chart marks use one validated violet; red is reserved for failures.
 */
export const DASHBOARD_CSS = `
.pd {
  --bg: #f4f1f8;
  --surface: #ffffff;
  --surface-2: #faf8fc;
  --border: #e2dce8;
  --text: #2a2634;
  --text-2: #595461;
  --text-3: #7a7484;
  --accent: #6d5e8a;
  --accent-soft: #e8e2f0;
  --mark: #6250d6;
  --mark-soft: #e4e0fa;
  --grid: #ece8f1;
  --good: #0a7a3d;
  --good-soft: #dff3e7;
  --bad: #c0352f;
  --bad-mark: #e34948;
  --bad-soft: #fbe3e2;
  --shadow: 0 1px 2px rgba(42, 38, 52, 0.04), 0 4px 16px rgba(42, 38, 52, 0.05);
  color-scheme: light;
  position: absolute;
  inset: 0;
  overflow-y: auto;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.pd[data-scheme='dark'] {
  --bg: #12101a;
  --surface: #1e1a28;
  --surface-2: #241f30;
  --border: #3a3448;
  --text: #f2f0f6;
  --text-2: #b7afc1;
  --text-3: #8f879b;
  --accent: #b8a8d4;
  --accent-soft: #2e2838;
  --mark: #9085e9;
  --mark-soft: #302a4a;
  --grid: #2c2738;
  --good: #5fd08f;
  --good-soft: #17301f;
  --bad: #f08a88;
  --bad-mark: #e66767;
  --bad-soft: #3a1d22;
  --shadow: none;
  color-scheme: dark;
}
.pd *, .pd *::before, .pd *::after { box-sizing: border-box; }
.pd button { font: inherit; color: inherit; cursor: pointer; }
.pd a { color: inherit; }
.pd-wrap { max-width: 1320px; margin: 0 auto; padding: 0 28px 64px; }

.pd-top {
  position: sticky; top: 0; z-index: 20;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}
.pd-top-inner { max-width: 1320px; margin: 0 auto; padding: 14px 28px 0; }
.pd-titlebar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.pd-brand { display: flex; align-items: baseline; gap: 10px; margin-right: auto; }
.pd-brand h1 { font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
.pd-brand span { color: var(--text-3); font-size: 13px; }
.pd-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pd-seg { display: inline-flex; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 3px; }
.pd-seg button { border: 0; background: transparent; padding: 6px 12px; border-radius: 7px; font-size: 13px; color: var(--text-2); }
.pd-seg button[aria-pressed='true'] { background: var(--accent-soft); color: var(--text); font-weight: 600; }
.pd-check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-2); user-select: none; cursor: pointer; }
.pd-btn { border: 1px solid var(--border); background: var(--surface); border-radius: 10px; padding: 7px 12px; font-size: 13px; }
.pd-btn:hover { border-color: var(--accent); }
.pd-btn:disabled { opacity: 0.5; cursor: default; }
.pd-tabs { display: flex; gap: 4px; margin-top: 12px; overflow-x: auto; }
.pd-tabs button {
  border: 0; background: transparent; padding: 10px 14px; font-size: 14px; color: var(--text-2);
  border-bottom: 2px solid transparent; white-space: nowrap;
}
.pd-tabs button[aria-selected='true'] { color: var(--text); font-weight: 600; border-bottom-color: var(--accent); }
.pd-tabs .pd-count { margin-left: 6px; font-size: 11px; padding: 1px 6px; border-radius: 99px; background: var(--accent-soft); color: var(--text-2); }

.pd-section { margin-top: 24px; }
.pd-grid { display: grid; gap: 16px; }
.pd-kpis { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.pd-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.pd-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.pd-main-side { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
@media (max-width: 1000px) {
  .pd-2, .pd-3, .pd-main-side { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .pd-wrap, .pd-top-inner { padding-left: 16px; padding-right: 16px; }
}

.pd-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px 20px; box-shadow: var(--shadow); min-width: 0; }
.pd-card-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.pd-card-head h2 { font-size: 15px; font-weight: 650; margin: 0; }
.pd-card-head p { margin: 2px 0 0; color: var(--text-3); font-size: 12.5px; }
.pd-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }

.pd-tile { padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 4px; }
.pd-tile-label { font-size: 12.5px; color: var(--text-2); }
.pd-tile-value { font-size: 28px; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.pd-tile-sub { font-size: 12px; color: var(--text-3); }
.pd-delta { font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 3px; }
.pd-delta[data-tone='good'] { color: var(--good); }
.pd-delta[data-tone='bad'] { color: var(--bad); }
.pd-delta[data-tone='flat'] { color: var(--text-3); }
.pd-tile svg { margin-top: 6px; }

.pd-highlights { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.pd-highlights li { display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; }
.pd-dot { flex: none; width: 22px; height: 22px; border-radius: 99px; display: grid; place-items: center; font-size: 12px; font-weight: 700; margin-top: 1px; }
.pd-dot[data-tone='good'] { background: var(--good-soft); color: var(--good); }
.pd-dot[data-tone='bad'] { background: var(--bad-soft); color: var(--bad); }
.pd-dot[data-tone='neutral'] { background: var(--accent-soft); color: var(--text-2); }

.pd-chart { position: relative; }
.pd-chart svg { display: block; overflow: visible; }
.pd-axis { font-size: 11px; fill: var(--text-3); font-variant-numeric: tabular-nums; }
.pd-tip {
  position: absolute; pointer-events: none; z-index: 5; transform: translate(-50%, -100%);
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.12); font-size: 12px; white-space: nowrap;
}
.pd-tip strong { display: block; font-size: 14px; font-variant-numeric: tabular-nums; }
.pd-tip span { color: var(--text-3); }

.pd-rank { display: grid; gap: 10px; }
.pd-rank-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; font-size: 13px; }
.pd-rank-row .v { font-variant-numeric: tabular-nums; font-weight: 600; }
.pd-rank-row .s { color: var(--text-3); font-weight: 400; margin-left: 6px; }
.pd-rank-bar { grid-column: 1 / -1; height: 8px; border-radius: 99px; background: var(--grid); overflow: hidden; }
.pd-rank-bar i { display: block; height: 100%; border-radius: 99px; background: var(--mark); }
.pd-rank-bar i[data-tone='bad'] { background: var(--bad-mark); }

.pd-funnel { display: grid; gap: 12px; }
.pd-funnel-row { display: grid; grid-template-columns: 150px minmax(0, 1fr) 92px; align-items: center; gap: 12px; font-size: 13px; }
.pd-funnel-track { height: 26px; border-radius: 6px; background: var(--grid); overflow: hidden; }
.pd-funnel-track i { display: block; height: 100%; border-radius: 6px; background: var(--mark); min-width: 2px; }
.pd-funnel-row .n { text-align: right; font-variant-numeric: tabular-nums; }
.pd-funnel-row .n b { font-size: 14px; }
.pd-funnel-row .n span { color: var(--text-3); margin-left: 6px; }

.pd-table-wrap { overflow-x: auto; margin: 0 -20px; padding: 0 20px; }
.pd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pd-table th { text-align: left; font-weight: 600; font-size: 12px; color: var(--text-3); padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.pd-table th button { border: 0; background: transparent; padding: 0; font-weight: 600; color: inherit; }
.pd-table th button[aria-pressed='true'] { color: var(--text); }
.pd-table td { padding: 10px; border-bottom: 1px solid var(--grid); vertical-align: middle; }
.pd-table tr:last-child td { border-bottom: 0; }
.pd-table td.num, .pd-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
.pd-table tbody tr.click { cursor: pointer; }
.pd-table tbody tr.click:hover td { background: var(--surface-2); }
.pd-muted { color: var(--text-3); }
.pd-small { font-size: 12px; }
.pd-ellipsis { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.pd-person { display: flex; align-items: center; gap: 10px; min-width: 0; }
.pd-avatar { flex: none; width: 30px; height: 30px; border-radius: 99px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 12px; text-transform: uppercase; }
.pd-badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 99px; background: var(--accent-soft); color: var(--text-2); white-space: nowrap; }
.pd-badge[data-tone='good'] { background: var(--good-soft); color: var(--good); }
.pd-badge[data-tone='bad'] { background: var(--bad-soft); color: var(--bad); }

.pd-search { border: 1px solid var(--border); background: var(--surface); border-radius: 10px; padding: 8px 12px; font: inherit; color: var(--text); min-width: 240px; }
.pd-search:focus { outline: 2px solid var(--accent); outline-offset: -1px; }

.pd-recipes { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.pd-recipe { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; box-shadow: var(--shadow); }
.pd-recipe-img { aspect-ratio: 4 / 3; background: var(--accent-soft); object-fit: cover; width: 100%; display: block; }
.pd-recipe-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.pd-recipe-title { font-weight: 600; font-size: 14px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pd-recipe-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; color: var(--text-3); }
.pd-linkish { border: 0; background: transparent; padding: 0; text-align: left; color: var(--text-2); font-size: 12px; text-decoration: underline; text-decoration-color: var(--border); text-underline-offset: 2px; }
.pd-linkish:hover { color: var(--text); }
.pd-mini-list { display: grid; gap: 2px; }
.pd-mini-row { display: flex; align-items: center; gap: 12px; padding: 8px 6px; border-radius: 10px; border: 0; background: transparent; text-align: left; width: 100%; }
.pd-mini-row:hover { background: var(--surface-2); }
.pd-mini-row img, .pd-mini-row .ph { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; flex: none; background: var(--accent-soft); }
.pd-mini-row .grow { min-width: 0; flex: 1; }
.pd-mini-row .t { font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pd-drawer-scrim { position: fixed; inset: 0; background: rgba(10, 8, 16, 0.35); z-index: 40; }
.pd-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(680px, 100vw); background: var(--bg); z-index: 41; overflow-y: auto; border-left: 1px solid var(--border); box-shadow: -12px 0 40px rgba(0,0,0,0.15); }
.pd-drawer-head { position: sticky; top: 0; background: var(--bg); padding: 18px 24px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; z-index: 1; }
.pd-drawer-head h2 { margin: 0; font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pd-drawer-body { padding: 20px 24px 48px; display: grid; gap: 16px; }
.pd-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.pd-fact { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; }
.pd-fact div:first-child { font-size: 11.5px; color: var(--text-3); }
.pd-fact div:last-child { font-size: 16px; font-weight: 650; margin-top: 2px; font-variant-numeric: tabular-nums; }
.pd-timeline { list-style: none; margin: 0; padding: 0; display: grid; }
.pd-timeline li { display: grid; grid-template-columns: 110px 14px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 7px 0; font-size: 13px; border-bottom: 1px solid var(--grid); }
.pd-timeline li:last-child { border-bottom: 0; }
.pd-timeline .when { color: var(--text-3); font-size: 12px; font-variant-numeric: tabular-nums; }
.pd-timeline .pip { width: 8px; height: 8px; border-radius: 99px; margin-top: 6px; background: var(--mark); }
.pd-timeline .pip[data-tone='bad'] { background: var(--bad-mark); }
.pd-timeline .pip[data-tone='muted'] { background: var(--border); }

.pd-center { min-height: 60vh; display: grid; place-items: center; text-align: center; padding: 24px; }
.pd-center h2 { margin: 0 0 8px; font-size: 20px; }
.pd-center p { color: var(--text-2); margin: 0 0 16px; }
.pd-error { background: var(--bad-soft); color: var(--bad); border-radius: 12px; padding: 12px 14px; margin-top: 16px; }
.pd-skeleton { background: linear-gradient(90deg, var(--grid), var(--surface-2), var(--grid)); background-size: 200% 100%; animation: pd-shimmer 1.2s infinite linear; border-radius: 16px; }
@keyframes pd-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.pd-empty { color: var(--text-3); font-size: 13px; padding: 12px 0; }
.pd-foot { margin-top: 28px; color: var(--text-3); font-size: 12px; }
.pd-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
