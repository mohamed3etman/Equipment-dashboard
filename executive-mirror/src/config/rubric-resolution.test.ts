import { describe, it, expect } from 'vitest';
import { loadRubric, loadSessionConfig, resolveRubric } from './loader';

describe('shared_with_en resolution', () => {
  it('Arabic sessions receive the shared dimensions, not only the Arabic-specific ones', () => {
    const cfg = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', 'ar');
    const ids = cfg.rubric.dimensions.map((d) => d.id);
    for (const shared of ['answer_fidelity', 'evidence_and_quantification', 'ownership', 'compression', 'strategic_framing', 'decision_orientation', 'technical_detail_control']) {
      expect(ids, `shared dimension '${shared}' never reached the Arabic evaluator`).toContain(shared);
    }
  });

  it('Arabic keeps its own calibrated dimension and does NOT inherit the English equivalent', () => {
    const cfg = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', 'ar');
    const ids = cfg.rubric.dimensions.map((d) => d.id);
    // The Arabic conclusion threshold is deliberately more permissive; pulling
    // in the English one would re-impose the stricter rule it exists to avoid.
    expect(ids).toContain('conclusion_positioning_ar');
    expect(ids).not.toContain('conclusion_positioning');
    expect(ids).toContain('pressure_integrity_ar');
    expect(ids).not.toContain('pressure_integrity');
  });

  it('Arabic now evaluates on at least as many dimensions as English', () => {
    const en = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', 'en');
    const ar = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', 'ar');
    expect(ar.rubric.dimensions.length).toBeGreaterThanOrEqual(en.rubric.dimensions.length);
  });

  it('English is unchanged by resolution', () => {
    const raw = loadRubric('rubrics/en/executive.v1');
    expect(resolveRubric(raw).dimensions.length).toBe(raw.dimensions.length);
  });

  it('fails loudly on a shared id that does not exist', () => {
    const raw = loadRubric('rubrics/ar/executive.v1');
    expect(() => resolveRubric({ ...raw, shared_with_en: ['not_a_real_dimension'] }))
      .toThrow(/do not exist in the English rubric/);
  });
});
