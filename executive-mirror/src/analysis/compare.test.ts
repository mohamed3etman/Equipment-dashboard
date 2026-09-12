import { describe, it, expect } from 'vitest';
import { compareAttempts } from './compare';
import { computeMetrics } from './metrics';
import { loadLexicon } from '@/config/loader';
import { makeTranscript, makeTurn } from '@/lib/testing';
import type { Evaluation, RetryObjective } from '@/lib/types';

const lex = loadLexicon('en');

const evalStub = (dims: Array<[string, Evaluation['dimensions'][number]['band']]>, weak: string[]): Evaluation => ({
  sessionId: 's', language: 'en', rubricId: 'executive', rubricVersion: 1, modelId: 'm',
  createdAt: new Date().toISOString(),
  strengths: [],
  weaknesses: weak.map((d) => ({
    dimension: d, severity: 'significant' as const, finding: 'f',
    evidence: [], whyItMatters: 'w', recommendedChange: 'r',
  })),
  dimensions: dims.map(([dimension, band]) => ({ dimension, band, rationale: '', evidence: [] })),
  mirror: [], seniority: { soundsLike: '', why: '', lift: '', evidence: [] },
  bestMoment: null, weakestMoment: null, stakeholderPerception: '',
  retryObjective: { id: 'r', statement: 's' }, rejected: [],
});

const hedgy = makeTranscript('en', [
  makeTurn({
    index: 0, speaker: 'user',
    text: 'I think we probably maybe improved it somewhat perhaps across the group I guess',
  }),
]);
const direct = makeTranscript('en', [
  makeTurn({
    index: 0, speaker: 'user',
    text: 'We cut report turnaround from 48 hours to 2 hours across the group',
  }),
]);

const objective: RetryObjective = {
  id: 'r1',
  statement: 'Remove the qualifiers and state the outcome directly.',
  targetMetricKey: 'hedge_count',
  targetDirection: 'decrease',
};

describe('retry comparison', () => {
  it('reports the target objective as achieved when the metric moves', () => {
    const c = compareAttempts(
      { metrics: computeMetrics(hedgy, lex), evaluation: evalStub([], []) },
      { metrics: computeMetrics(direct, lex), evaluation: evalStub([], []) },
      objective,
    );
    expect(c.targetOutcome.verdict).toBe('achieved');
    expect(c.targetOutcome.metric!.before).toBeGreaterThan(c.targetOutcome.metric!.after);
  });

  it('reports not_achieved when the speaker did not change', () => {
    const c = compareAttempts(
      { metrics: computeMetrics(hedgy, lex), evaluation: evalStub([], []) },
      { metrics: computeMetrics(hedgy, lex), evaluation: evalStub([], []) },
      objective,
    );
    expect(c.targetOutcome.verdict).toBe('not_achieved');
  });

  it('reports not_measurable when the objective has no bound metric', () => {
    const c = compareAttempts(
      { metrics: computeMetrics(hedgy, lex), evaluation: evalStub([], []) },
      { metrics: computeMetrics(direct, lex), evaluation: evalStub([], []) },
      { id: 'r2', statement: 'Sound more like a director.' },
    );
    expect(c.targetOutcome.verdict).toBe('not_measurable');
  });

  it('treats sub-noise-floor movement as unchanged, not improvement', () => {
    const a = makeTranscript('en', [
      makeTurn({ index: 0, speaker: 'user', text: Array(100).fill('word').join(' ') + ' maybe' }),
    ]);
    const b = makeTranscript('en', [
      makeTurn({ index: 0, speaker: 'user', text: Array(102).fill('word').join(' ') + ' maybe' }),
    ]);
    const c = compareAttempts(
      { metrics: computeMetrics(a, lex), evaluation: evalStub([], []) },
      { metrics: computeMetrics(b, lex), evaluation: evalStub([], []) },
      objective,
    );
    const wpr = [...c.improved, ...c.regressed, ...c.unchanged].find((d) => d.key === 'words_per_response_mean');
    expect(wpr!.direction).toBe('unchanged');
  });

  it('tracks resolved, persistent and new weaknesses', () => {
    const c = compareAttempts(
      { metrics: computeMetrics(hedgy, lex), evaluation: evalStub([], ['hedging_control', 'compression']) },
      { metrics: computeMetrics(direct, lex), evaluation: evalStub([], ['compression', 'ownership']) },
      objective,
    );
    expect(c.resolvedWeaknesses).toEqual(['hedging_control']);
    expect(c.persistentWeaknesses).toEqual(['compression']);
    expect(c.newWeaknesses).toEqual(['ownership']);
  });

  it('reports band movement without letting it decide the verdict', () => {
    const c = compareAttempts(
      { metrics: computeMetrics(hedgy, lex), evaluation: evalStub([['hedging_control', 'critical']], []) },
      { metrics: computeMetrics(hedgy, lex), evaluation: evalStub([['hedging_control', 'strong']], []) },
      objective,
    );
    expect(c.bandMovements[0]!.direction).toBe('improved');
    // The metric did not move, so the headline verdict must still be negative.
    expect(c.targetOutcome.verdict).toBe('not_achieved');
  });
});
