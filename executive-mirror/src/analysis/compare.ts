/**
 * Retry comparison. (V2 §18)
 *
 * The retry loop is the product's core behaviour, so "did it improve?" must be
 * answered from evidence rather than asserted. Objective and semi-objective
 * metrics carry the verdict; AI-inferred bands are reported as movement but
 * NEVER as the headline, because a band shift can reflect model variance rather
 * than the speaker changing. (V2 §15, and the reason Tier C is not trended.)
 */
import { BAND_RANK, type Band, type Evaluation, type Metric, type RetryObjective } from '@/lib/types';
import type { Pass0Result } from './metrics';

export type Direction = 'improved' | 'regressed' | 'unchanged';

export interface MetricDelta {
  key: string;
  label: string;
  unit: string;
  tier: Metric['tier'];
  before: number;
  after: number;
  delta: number;
  /** Percentage change; null when `before` is 0. */
  pctChange: number | null;
  direction: Direction;
  /** True for the metric the retry objective targeted. */
  isTarget: boolean;
}

export interface BandDelta {
  dimension: string;
  before: Band;
  after: Band;
  direction: Direction;
}

export interface RetryComparison {
  objective: RetryObjective;
  /** The headline: did the targeted behaviour actually change? */
  targetOutcome: {
    verdict: 'achieved' | 'partial' | 'not_achieved' | 'not_measurable';
    explanation: string;
    metric?: MetricDelta;
  };
  improved: MetricDelta[];
  regressed: MetricDelta[];
  unchanged: MetricDelta[];
  bandMovements: BandDelta[];
  /** Weaknesses present in attempt 1 that no longer appear in attempt 2. */
  resolvedWeaknesses: string[];
  /** Weaknesses that persisted across both attempts. */
  persistentWeaknesses: string[];
  /** Weaknesses that appeared only in attempt 2 — the cost of the correction. */
  newWeaknesses: string[];
}

/**
 * Whether a lower value is better for a given metric.
 * Anything not listed is treated as neutral and reported without a verdict.
 */
const LOWER_IS_BETTER = new Set([
  'filler_count', 'filler_rate_per_100w',
  'hedge_count', 'hedge_density_per_100w',
  'apology_count',
  'conclusion_latency_words',
  'long_pause_count',
  'response_latency_mean_ms',
  'jargon_density_per_100w',
  'longest_monologue_s',
]);

const HIGHER_IS_BETTER = new Set([
  'quantification_count', 'quantification_per_minute',
  'ownership_marker_count',
]);

/** Movement smaller than this is noise, not change. */
const NOISE_FLOOR_PCT = 8;

function classify(key: string, before: number, after: number): Direction {
  const delta = after - before;
  if (delta === 0) return 'unchanged';

  const pct = before === 0 ? 100 : Math.abs(delta / before) * 100;
  if (pct < NOISE_FLOOR_PCT) return 'unchanged';

  if (LOWER_IS_BETTER.has(key)) return delta < 0 ? 'improved' : 'regressed';
  if (HIGHER_IS_BETTER.has(key)) return delta > 0 ? 'improved' : 'regressed';
  return 'unchanged';   // neutral metric — report the number, claim nothing
}

export function compareAttempts(
  before: { metrics: Pass0Result; evaluation: Evaluation },
  after: { metrics: Pass0Result; evaluation: Evaluation },
  objective: RetryObjective,
): RetryComparison {
  const beforeByKey = before.metrics.byKey;
  const afterMetrics = after.metrics.metrics;

  const deltas: MetricDelta[] = [];
  for (const m of afterMetrics) {
    const b = beforeByKey[m.key];
    if (b === undefined) continue;
    const delta = Math.round((m.value - b) * 100) / 100;
    deltas.push({
      key: m.key,
      label: m.label,
      unit: m.unit,
      tier: m.tier,
      before: b,
      after: m.value,
      delta,
      pctChange: b === 0 ? null : Math.round((delta / b) * 1000) / 10,
      direction: classify(m.key, b, m.value),
      isTarget: m.key === objective.targetMetricKey,
    });
  }

  const improved = deltas.filter((d) => d.direction === 'improved');
  const regressed = deltas.filter((d) => d.direction === 'regressed');
  const unchanged = deltas.filter((d) => d.direction === 'unchanged');

  // ---- Did the retry objective land? --------------------------------------
  const target = deltas.find((d) => d.isTarget);
  let targetOutcome: RetryComparison['targetOutcome'];

  if (!target) {
    targetOutcome = {
      verdict: 'not_measurable',
      explanation: objective.targetMetricKey
        ? `The objective targeted '${objective.targetMetricKey}', which was not produced for both attempts.`
        : 'This objective was not bound to a deterministic metric, so improvement cannot be measured objectively. Read the findings below instead.',
    };
  } else {
    const wanted = objective.targetDirection
      ?? (LOWER_IS_BETTER.has(target.key) ? 'decrease' : 'increase');
    const moved = wanted === 'decrease' ? target.delta < 0 : target.delta > 0;
    const magnitude = target.pctChange === null ? 100 : Math.abs(target.pctChange);

    if (moved && magnitude >= 25) {
      targetOutcome = {
        verdict: 'achieved',
        explanation: `${target.label} moved from ${target.before}${target.unit} to ${target.after}${target.unit}.`,
        metric: target,
      };
    } else if (moved && magnitude >= NOISE_FLOOR_PCT) {
      targetOutcome = {
        verdict: 'partial',
        explanation: `${target.label} moved in the right direction (${target.before}${target.unit} → ${target.after}${target.unit}) but by less than a quarter.`,
        metric: target,
      };
    } else {
      targetOutcome = {
        verdict: 'not_achieved',
        explanation: `${target.label} was ${target.before}${target.unit} and is now ${target.after}${target.unit} — no meaningful movement in the intended direction.`,
        metric: target,
      };
    }
  }

  // ---- Band movements — reported, never headlined -------------------------
  const beforeBands = new Map(before.evaluation.dimensions.map((d) => [d.dimension, d.band]));
  const bandMovements: BandDelta[] = [];
  for (const d of after.evaluation.dimensions) {
    const b = beforeBands.get(d.dimension);
    if (!b || b === d.band) continue;
    bandMovements.push({
      dimension: d.dimension,
      before: b,
      after: d.band,
      direction: BAND_RANK[d.band] > BAND_RANK[b] ? 'improved' : 'regressed',
    });
  }

  // ---- Finding-level movement ---------------------------------------------
  const beforeDims = new Set(before.evaluation.weaknesses.map((w) => w.dimension));
  const afterDims = new Set(after.evaluation.weaknesses.map((w) => w.dimension));

  return {
    objective,
    targetOutcome,
    improved,
    regressed,
    unchanged,
    bandMovements,
    resolvedWeaknesses: [...beforeDims].filter((d) => !afterDims.has(d)),
    persistentWeaknesses: [...beforeDims].filter((d) => afterDims.has(d)),
    newWeaknesses: [...afterDims].filter((d) => !beforeDims.has(d)),
  };
}
