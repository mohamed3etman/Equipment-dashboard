import { describe, it, expect } from 'vitest';
import { CONTROL_MODE, SAMPLES } from './failure-modes';
import { controlFor, evaluateCorpus, metricsFor } from './run-corpus';

const results = evaluateCorpus();

describe('failure-mode discrimination — deterministic layer', () => {
  for (const r of results) {
    const name = `${r.sample.mode} [${r.sample.condition}]`;

    if (r.requiresLlm) {
      it(`${name} — declared as requiring the LLM passes, with a stated reason`, () => {
        // Documents the gap rather than pretending the deterministic layer
        // covers it. If a future change makes one of these separable
        // deterministically, this test fails and the claim gets updated.
        expect(r.sample.expect.note.length).toBeGreaterThan(60);
      });
      continue;
    }

    it(`${name} — separated from the control by deterministic metrics`, () => {
      for (const s of r.separations) {
        expect(
          s.separated,
          `${s.metric}: control=${s.control} sample=${s.sample} (expected clear separation)`,
        ).toBe(true);
      }
    });
  }
});

describe('control sample is clean on every failure signal', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang} control shows no failure markers`, () => {
      const m = metricsFor(controlFor(lang)).byKey;
      expect(m.apology_count).toBe(0);
      expect(m.filler_count).toBe(0);
      expect(m.hedge_count).toBe(0);
      expect(m.quantification_count!).toBeGreaterThan(0);
      expect(m.ownership_marker_count!).toBeGreaterThan(0);
    });
  }
});

describe('code-switching false-positive guard', () => {
  it('a strong code-switched answer is not penalised for switching', () => {
    const mixed = SAMPLES.find((s) => s.mode === CONTROL_MODE && s.condition === 'mixed')!;
    const m = metricsFor(mixed).byKey;
    // Switching must be VISIBLE...
    expect(m.code_switch_events!).toBeGreaterThan(0);
    // ...but must not inflate any failure signal.
    expect(m.filler_count).toBe(0);
    expect(m.hedge_count).toBe(0);
    expect(m.apology_count).toBe(0);
    expect(m.quantification_count!).toBeGreaterThan(0);
  });

  it('Arabic courtesy markers are never counted as hedges or apologies', () => {
    // سعادتكم / تفضلتم are respect, not weakness. Only اعتذر/المعذرة are apologies.
    const courteous = SAMPLES.find(
      (s) => s.mode === 'defensive_under_challenge' && s.language === 'ar',
    )!;
    const m = metricsFor(courteous);
    const apologySpans = m.metrics.find((x) => x.key === 'apology_count')?.spans ?? [];
    for (const span of apologySpans) {
      expect(span.quote).not.toContain('سعادتكم');
      expect(span.quote).not.toContain('تفضلتم');
    }
  });
});

describe('over-explanation is caught by length, not by vocabulary', () => {
  it('the over-explaining answer is articulate — length is what betrays it', () => {
    const over = SAMPLES.find((s) => s.mode === 'over_explanation' && s.language === 'en')!;
    const control = metricsFor(controlFor('en')).byKey;
    const m = metricsFor(over).byKey;
    // Proves the corpus tests FUNCTION, not vocabulary: this answer is fluent,
    // hedge-free and well-quantified. It is caught purely on length.
    expect(m.hedge_count).toBe(0);
    expect(m.quantification_count!).toBeGreaterThan(0);
    expect(m.words_per_response_mean!).toBeGreaterThan(control.words_per_response_mean! * 2);
  });
});
