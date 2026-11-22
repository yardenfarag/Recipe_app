/**
 * PIN-49: "what to look at next" for the web admin dashboard. Fixed rules over the
 * admin_dashboard and admin_dashboard_insights numbers. No model call, so the hints
 * cost nothing and say the same thing for the same data.
 *
 * Each rule needs a minimum amount of data (MIN_SAMPLE) before it says anything, so a
 * quiet week does not produce alarms from three events.
 */
import {
  featureName,
  formatPercent,
  formatUsd,
  modelName,
  num,
  rangeLabel,
  type Dashboard,
} from './adminDashboard';
import { platformName } from './adminDashboardView';

export type PlatformExtracts = {
  platform: string;
  /** Extracts that returned a recipe or failed (cache hits and rejected posts left out). */
  attempts: number;
  recipes: number;
  failed: number;
  /** Recipes that needed the video step. */
  video: number;
  cost_usd: number;
  p95_ms: number | null;
};

export type GateRoute = {
  /** What Jev decided: full_recipe_in_text, partial, needs_video or no_recipe. */
  route: string;
  extracts: number;
  recipes: number;
  video: number;
  failed: number;
  /** Stopped by the gate as "not a recipe". */
  blocked: number;
};

export type GateWindow = {
  decisions: number;
  confident: number;
  low_confidence: number;
  errors: number;
  cost_usd: number;
  routes: GateRoute[];
};

export type TranslationWindow = {
  calls: number;
  ok: number;
  failed: number;
  cost_usd: number;
  people: number;
  languages: { label: string; count: number }[];
};

export type LatencyRow = { action: string; calls: number; p50_ms: number | null; p95_ms: number | null };

type Windows<T> = { current: T; previous: T };

/** What admin_dashboard_insights returns. */
export type DashboardInsights = {
  range: { days: number; tz: string; since: string; previous_since: string };
  extract_by_platform: Windows<PlatformExtracts[]>;
  gate: Windows<GateWindow>;
  translations: Windows<TranslationWindow>;
  latency: LatencyRow[];
};

/** Where a hint's numbers are shown. */
export type HintTab = 'overview' | 'people' | 'costs' | 'failures';

export type Hint = {
  id: string;
  /** fix: costs money or people now. watch: worth a look. good: something improved. */
  tone: 'fix' | 'watch' | 'good';
  title: string;
  detail: string;
  tab: HintTab;
};

/** Below this many events a rate is noise. */
export const MIN_SAMPLE = 10;

const ratio = (part: number, whole: number) => (whole > 0 ? num(part) / num(whole) : 0);
const points = (rate: number) => Math.round(rate * 100);

/** "1.2 s", "48 s", "2.1 min". */
export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(Number(ms))) return '—';
  const n = Number(ms);
  if (n < 1000) return `${Math.round(n)} ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)} s`;
  return `${(n / 60_000).toFixed(1)} min`;
}

const GATE_ROUTE_NAMES: Record<string, string> = {
  full_recipe_in_text: 'Recipe is in the text',
  partial: 'Part of a recipe in the text',
  needs_video: 'Needs the video',
  no_recipe: 'Not a recipe',
};

/** What a Jev extract-gate route means, in words. */
export function gateRouteName(route: string): string {
  return GATE_ROUTE_NAMES[route] ?? route.replaceAll('_', ' ');
}

/** Per-platform extraction with failure rate and video share, most attempts first. */
export function platformFailureRows(insights: DashboardInsights) {
  const before = new Map(insights.extract_by_platform.previous.map((p) => [p.platform, p]));
  return insights.extract_by_platform.current
    .map((p) => {
      const prev = before.get(p.platform);
      return {
        platform: p.platform,
        label: platformName(p.platform),
        attempts: num(p.attempts),
        failed: num(p.failed),
        recipes: num(p.recipes),
        video: num(p.video),
        failureRate: ratio(p.failed, p.attempts),
        previousRate: prev && num(prev.attempts) > 0 ? ratio(prev.failed, prev.attempts) : null,
        videoShare: num(p.recipes) > 0 ? ratio(p.video, p.recipes) : null,
        costPerRecipe: num(p.recipes) > 0 ? num(p.cost_usd) / num(p.recipes) : null,
        p95Ms: p.p95_ms == null ? null : num(p.p95_ms),
      };
    })
    .sort((a, b) => b.attempts - a.attempts || a.label.localeCompare(b.label));
}

/**
 * How the gate's "the recipe is in the text" call held up: of the extracts it sent
 * straight to the text step, how many still needed the video or failed.
 */
export function gateTextMisses(gate: GateWindow): { extracts: number; misses: number; rate: number } {
  const text = gate.routes.find((r) => r.route === 'full_recipe_in_text');
  const extracts = num(text?.extracts);
  const misses = num(text?.video) + num(text?.failed);
  return { extracts, misses, rate: ratio(misses, extracts) };
}

/** Slow means a long wait for the person: extraction may take a while, everything else should be quick. */
function slowThresholdMs(action: string): number {
  return action === 'extract' ? 60_000 : 20_000;
}

const TONE_ORDER: Record<Hint['tone'], number> = { fix: 0, watch: 1, good: 2 };

/**
 * The hints for one dashboard range, most urgent first. `insights` may be missing
 * (an older backend, or its call failed); the rules that need it are skipped.
 */
export function buildHints(data: Dashboard, insights: DashboardInsights | null): Hint[] {
  const out: Hint[] = [];
  const now = data.kpis.current;
  const before = data.kpis.previous;
  const period = rangeLabel(data.range.days);

  // --- Money -------------------------------------------------------------------
  const cost = num(now.ai_cost_usd);
  const revenue = num(now.revenue_usd);
  if (cost >= 1 && revenue < cost) {
    out.push({
      id: 'margin',
      tone: 'fix',
      title: 'AI cost more than credit sales brought in',
      detail: `${formatUsd(cost)} of AI against about ${formatUsd(revenue)} of revenue in ${period}. Look at the costliest features and who used them.`,
      tab: 'costs',
    });
  }

  const extractions = num(now.extractions);
  const prevExtractions = num(before.extractions);
  if (extractions >= MIN_SAMPLE && prevExtractions >= MIN_SAMPLE) {
    const perNow = cost / extractions;
    const perBefore = num(before.ai_cost_usd) / prevExtractions;
    if (perBefore > 0) {
      const change = (perNow - perBefore) / perBefore;
      if (change >= 0.25) {
        out.push({
          id: 'cost-per-extraction-up',
          tone: 'watch',
          title: `AI cost per extraction rose ${Math.round(change * 100)}%`,
          detail: `${formatUsd(perNow, { precise: true })} now, ${formatUsd(perBefore, { precise: true })} the period before. Check which model and feature grew.`,
          tab: 'costs',
        });
      } else if (change <= -0.2) {
        out.push({
          id: 'cost-per-extraction-down',
          tone: 'good',
          title: `AI cost per extraction fell ${Math.round(-change * 100)}%`,
          detail: `${formatUsd(perNow, { precise: true })} now, ${formatUsd(perBefore, { precise: true })} the period before.`,
          tab: 'costs',
        });
      }
    }
  }

  const llmCost = data.cost_by_model.reduce((sum, m) => sum + num(m.cost_usd), 0);
  const calls = data.cost_by_model.reduce((sum, m) => sum + num(m.calls), 0);
  const top = [...data.cost_by_model].sort((a, b) => num(b.cost_usd) - num(a.cost_usd))[0];
  if (top && llmCost >= 1 && calls >= MIN_SAMPLE * 2 && ratio(top.cost_usd, llmCost) >= 0.6 && data.cost_by_model.length > 1) {
    out.push({
      id: 'model-concentration',
      tone: 'watch',
      title: `${modelName(top.model)} is ${formatPercent(top.cost_usd, llmCost)} of model spend`,
      detail: `${formatUsd(num(top.cost_usd))} over ${num(top.calls)} calls. See whether any of its tasks would do as well on a cheaper model.`,
      tab: 'costs',
    });
  }

  const totalCost = data.cost_by_action.reduce((sum, a) => sum + num(a.cost_usd), 0);
  for (const a of data.cost_by_action) {
    if (a.action === 'extract' || totalCost < 1) continue;
    if (ratio(a.cost_usd, totalCost) >= 0.25) {
      out.push({
        id: `feature-cost-${a.action}`,
        tone: 'watch',
        title: `${featureName(a.action)} is ${formatPercent(a.cost_usd, totalCost)} of AI cost`,
        detail: `${formatUsd(num(a.cost_usd))} over ${num(a.events)} calls, more than any feature besides extraction should need.`,
        tab: 'costs',
      });
    }
  }

  if (cost >= 1) {
    const guestShare = ratio(now.ai_cost_guest_usd, cost);
    if (guestShare >= 0.3) {
      out.push({
        id: 'guest-cost',
        tone: 'watch',
        title: `Guests caused ${formatPercent(now.ai_cost_guest_usd, cost)} of AI cost`,
        detail: `${formatUsd(num(now.ai_cost_guest_usd))} from people without an account, who can't buy credits. Consider a tighter guest limit.`,
        tab: 'costs',
      });
    }
    const adminShare = ratio(now.ai_cost_admin_usd, cost);
    if (adminShare >= 0.3) {
      out.push({
        id: 'admin-cost',
        tone: 'watch',
        title: `Admin testing was ${formatPercent(now.ai_cost_admin_usd, cost)} of AI cost`,
        detail: `${formatUsd(num(now.ai_cost_admin_usd))} from admin accounts. Seed scripts and test runs add up.`,
        tab: 'costs',
      });
    }
  }

  // --- Failures ------------------------------------------------------------------
  const attempts = extractions + num(now.extraction_failures);
  const prevAttempts = prevExtractions + num(before.extraction_failures);
  if (attempts >= MIN_SAMPLE * 2 && prevAttempts >= MIN_SAMPLE * 2) {
    const rate = ratio(now.extraction_failures, attempts);
    const prevRate = ratio(before.extraction_failures, prevAttempts);
    const diff = points(rate) - points(prevRate);
    if (diff >= 5) {
      out.push({
        id: 'failure-rate-up',
        tone: 'fix',
        title: `Extraction failures rose to ${points(rate)}%`,
        detail: `Up from ${points(prevRate)}% the period before. The latest problems show what broke.`,
        tab: 'failures',
      });
    } else if (diff <= -5) {
      out.push({
        id: 'failure-rate-down',
        tone: 'good',
        title: `Extraction failures fell to ${points(rate)}%`,
        detail: `Down from ${points(prevRate)}% the period before.`,
        tab: 'failures',
      });
    }
  }

  if (insights) {
    for (const p of platformFailureRows(insights)) {
      if (p.attempts < MIN_SAMPLE || p.failureRate < 0.2) continue;
      const trend = p.previousRate == null ? '' : ` (${points(p.previousRate)}% the period before)`;
      out.push({
        id: `platform-failures-${p.platform}`,
        tone: p.failureRate >= 0.3 ? 'fix' : 'watch',
        title: `${p.label} imports fail ${points(p.failureRate)}% of the time`,
        detail: `${p.failed} of ${p.attempts} attempts failed${trend}. Check the latest problems for this platform.`,
        tab: 'failures',
      });
    }
  }

  // Extraction is covered per platform above; the gate and translation get their own rules below when the
  // insights arrived, so they are not reported twice.
  const ownRules = insights ? new Set(['extract', 'extract_gate', 'translate']) : new Set(['extract']);
  for (const a of data.cost_by_action) {
    if (ownRules.has(a.action) || num(a.events) < MIN_SAMPLE) continue;
    const rate = ratio(a.failed, a.events);
    if (rate >= 0.15) {
      out.push({
        id: `feature-failures-${a.action}`,
        tone: rate >= 0.3 ? 'fix' : 'watch',
        title: `${featureName(a.action)} fails ${points(rate)}% of the time`,
        detail: `${num(a.failed)} of ${num(a.events)} calls in ${period}.`,
        tab: 'failures',
      });
    }
  }

  if (insights) {
    // --- Video step ----------------------------------------------------------------
    for (const p of platformFailureRows(insights)) {
      if (p.recipes < MIN_SAMPLE || p.videoShare == null || p.videoShare < 0.5) continue;
      out.push({
        id: `video-share-${p.platform}`,
        tone: 'watch',
        title: `${formatPercent(p.video, p.recipes)} of ${p.label} recipes needed the video`,
        detail: `The video step is the slow, expensive path${p.costPerRecipe != null ? ` (${formatUsd(p.costPerRecipe, { precise: true })} per ${p.label} recipe)` : ''}. Better text sources (captions, comments) would cut it.`,
        tab: 'costs',
      });
    }

    // --- Jev gate ------------------------------------------------------------------
    const gate = insights.gate.current;
    const decisions = num(gate.decisions);
    const misses = gateTextMisses(gate);
    if (misses.extracts >= MIN_SAMPLE && misses.rate >= 0.2) {
      out.push({
        id: 'gate-text-misses',
        tone: 'watch',
        title: `The Jev gate was wrong on ${points(misses.rate)}% of "recipe is in the text" calls`,
        detail: `${misses.misses} of ${misses.extracts} still needed the video or failed. Raise its confidence threshold or retrain it on these posts.`,
        tab: 'costs',
      });
    }
    if (decisions >= MIN_SAMPLE * 2 && ratio(gate.low_confidence, decisions) >= 0.4) {
      out.push({
        id: 'gate-unsure',
        tone: 'watch',
        title: `The Jev gate was unsure on ${formatPercent(gate.low_confidence, decisions)} of posts`,
        detail: `Those ${num(gate.low_confidence)} posts ran the full extraction ladder, so the gate saved nothing on them.`,
        tab: 'costs',
      });
    }
    if (decisions >= MIN_SAMPLE && num(gate.errors) >= 3 && ratio(gate.errors, decisions) >= 0.05) {
      out.push({
        id: 'gate-errors',
        tone: 'fix',
        title: `The Jev gate errored on ${formatPercent(gate.errors, decisions)} of posts`,
        detail: `${num(gate.errors)} errors in ${period}. Each one adds a wait before extraction starts.`,
        tab: 'failures',
      });
    }

    // --- Translation ---------------------------------------------------------------
    const tr = insights.translations.current;
    const trPrev = insights.translations.previous;
    if (num(tr.calls) >= MIN_SAMPLE && ratio(tr.failed, tr.calls) >= 0.1) {
      out.push({
        id: 'translation-failures',
        tone: 'fix',
        title: `Translations fail ${formatPercent(tr.failed, tr.calls)} of the time`,
        detail: `${num(tr.failed)} of ${num(tr.calls)} translations in ${period}.`,
        tab: 'failures',
      });
    }
    if (num(tr.calls) >= MIN_SAMPLE && num(trPrev.calls) >= MIN_SAMPLE && num(tr.calls) >= num(trPrev.calls) * 2) {
      out.push({
        id: 'translation-volume',
        tone: 'watch',
        title: `Translations more than doubled`,
        detail: `${num(tr.calls)} in ${period}, ${num(trPrev.calls)} the period before, for ${formatUsd(num(tr.cost_usd))}. Worth checking that cached translations are reused.`,
        tab: 'costs',
      });
    }

    // --- Speed ---------------------------------------------------------------------
    for (const row of insights.latency) {
      if (num(row.calls) < MIN_SAMPLE || row.p95_ms == null) continue;
      if (num(row.p95_ms) >= slowThresholdMs(row.action)) {
        out.push({
          id: `slow-${row.action}`,
          tone: 'watch',
          title: `${featureName(row.action)} is slow for 1 in 20 people`,
          detail: `The slowest 5% took ${formatMs(row.p95_ms)} or more (typical: ${formatMs(row.p50_ms)}).`,
          tab: 'failures',
        });
      }
    }
  }

  // --- People --------------------------------------------------------------------
  const f = data.funnel;
  if (num(f.signed_up) >= MIN_SAMPLE && ratio(f.extracted, f.signed_up) < 0.4) {
    out.push({
      id: 'activation',
      tone: 'fix',
      title: `Only ${formatPercent(f.extracted, f.signed_up)} of new people extracted a recipe`,
      detail: `${num(f.extracted)} of ${num(f.signed_up)} sign-ups in ${period}. Onboarding should get people to their first import.`,
      tab: 'overview',
    });
  }
  if (num(f.saved_3) >= MIN_SAMPLE && num(f.purchased) === 0) {
    out.push({
      id: 'no-purchases',
      tone: 'watch',
      title: `${num(f.saved_3)} engaged new people, none bought credits`,
      detail: `They saved 3 or more recipes each. Check when they meet the paywall and what it offers.`,
      tab: 'people',
    });
  }

  return out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}
