import { describe, it, expect } from 'vitest';
import { auditFinding, auditRetryObjective } from './coaching-quality';
import type { Finding } from '@/lib/types';

const base: Finding = {
  dimension: 'compression', severity: 'significant',
  finding: 'The answer spent 90 seconds on implementation before naming the outcome.',
  evidence: [{ turnIndex: 1, quote: 'we mapped the workflow across all seven departments', startMs: 1000, endMs: 4000 }],
  whyItMatters: 'A CEO reads implementation depth as operational rather than strategic ownership.',
  recommendedChange: 'Lead with the measurable outcome, then give only the two details that establish credibility.',
};

describe('coaching-quality gate — §8 bar', () => {
  it('accepts the worked GOOD example from the brief', () => {
    expect(auditFinding(base)).toEqual([]);
  });

  it('rejects "You should be more concise."', () => {
    const issues = auditFinding({ ...base, recommendedChange: 'Be more concise.' });
    expect(issues.map((i) => i.kind)).toContain('generic_recommendation');
  });

  it('rejects "Be more confident."', () => {
    const issues = auditFinding({ ...base, recommendedChange: 'Be more confident.' });
    expect(issues.length).toBeGreaterThan(0);
  });

  it('rejects a recommendation that names no action', () => {
    const issues = auditFinding({ ...base, recommendedChange: 'This weakens the overall impression you create.' });
    expect(issues.map((i) => i.kind)).toContain('no_action');
  });

  it('rejects "why it matters" that never names who is affected', () => {
    const issues = auditFinding({ ...base, whyItMatters: 'It is not ideal and could be better.' });
    expect(issues.map((i) => i.kind)).toContain('no_audience_consequence');
  });

  it('accepts an Arabic finding that meets the bar', () => {
    const issues = auditFinding({
      ...base,
      finding: 'الإجابة سردت الإجراء قبل الوصول الى أي موقف.',
      whyItMatters: 'الرئيس التنفيذي سيقرأ هذا كمستوى تشغيلي لا تنفيذي.',
      recommendedChange: 'ابدأ بالقرار الذي اتخذته، ثم أعط تفصيلين على الأكثر.',
    });
    expect(issues).toEqual([]);
  });

  it('rejects generic Arabic coaching', () => {
    const issues = auditFinding({
      ...base,
      whyItMatters: 'الرئيس التنفيذي لن يقتنع.',
      recommendedChange: 'كن أكثر ثقة.',
    });
    expect(issues.map((i) => i.kind)).toContain('generic_recommendation');
  });
});

describe('retry objective gate', () => {
  const metrics = [{ key: 'conclusion_latency_words', label: '', value: 0, unit: '', tier: 'semi_objective' as const }];

  it('accepts a bound, actionable objective', () => {
    expect(auditRetryObjective(
      'Answer in under 30 seconds and lead with the conclusion.',
      'conclusion_latency_words', metrics,
    )).toEqual([]);
  });

  it('rejects an objective bound to a metric Pass 0 does not produce', () => {
    const issues = auditRetryObjective('Lead with the conclusion.', 'executive_presence_score', metrics);
    expect(issues[0]!.detail).toMatch(/does not produce/);
  });

  it('rejects a vague objective', () => {
    expect(auditRetryObjective('Be more executive.', undefined, metrics).length).toBeGreaterThan(0);
  });
});
