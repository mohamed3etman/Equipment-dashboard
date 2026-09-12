import { describe, it, expect } from 'vitest';
import { locateQuote, verifyFinding, verifyFindings } from './evidence';
import { makeTranscript, makeTurn } from '@/lib/testing';

const en = makeTranscript('en', [
  makeTurn({ index: 0, speaker: 'persona', text: 'What did you personally decide?' }),
  makeTurn({
    index: 1, speaker: 'user', startMs: 3000,
    text: 'I think we probably improved the process quite a lot across the group.',
  }),
  makeTurn({ index: 2, speaker: 'persona', text: 'Why should I believe that?', startMs: 9000 }),
  makeTurn({
    index: 3, speaker: 'user', startMs: 12000,
    text: 'Turnaround went from 48 hours to 2 hours within one quarter.',
  }),
]);

const ar = makeTranscript('ar', [
  makeTurn({ index: 0, speaker: 'persona', text: 'ما الذي قررته أنت شخصياً؟' }),
  makeTurn({
    index: 1, speaker: 'user', startMs: 3000,
    text: 'أعتقد أننا حسّنا العملية بشكل كبير على مستوى المجموعة.',
  }),
]);

const opts = { metricsByKey: { hedge_count: 2, words_per_minute: 150 }, language: 'en' as const };
const arOpts = { metricsByKey: { hedge_count: 1 }, language: 'ar' as const };

const good = {
  dimension: 'hedging_control',
  severity: 'significant' as const,
  finding: 'The claim was delivered with stacked qualifiers.',
  evidence: [{ quote: 'I think we probably improved' }],
  whyItMatters: 'A hiring executive reads stacked qualifiers as an unformed position.',
  recommendedChange: 'State the improvement, then the one genuine uncertainty.',
};

describe('locateQuote', () => {
  it('finds a verbatim quote and returns real timings', () => {
    const span = locateQuote('we probably improved the process', en);
    expect(span).not.toBeNull();
    expect(span!.turnIndex).toBe(1);
    expect(span!.startMs).toBeGreaterThanOrEqual(3000);
    expect(span!.endMs).toBeGreaterThan(span!.startMs);
  });

  it('refuses to anchor to a persona turn', () => {
    expect(locateQuote('Why should I believe that', en)).toBeNull();
  });

  it('returns null for a quote the user never said', () => {
    expect(locateQuote('we reduced mortality by forty percent', en)).toBeNull();
  });

  it('matches Arabic despite diacritics in the transcript', () => {
    // Model returns the quote WITHOUT the shadda that appears in the transcript.
    const span = locateQuote('اعتقد اننا حسنا العملية', ar);
    expect(span).not.toBeNull();
    expect(span!.turnIndex).toBe(1);
  });

  it('preserves original characters in the returned quote', () => {
    const span = locateQuote('اعتقد اننا', ar);
    expect(span!.quote).toContain('أعتقد');   // original alef-hamza, not normalised
  });
});

describe('verifyFinding — enforcement', () => {
  it('accepts a well-formed, evidenced finding', () => {
    const r = verifyFinding(good, en, opts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.finding.evidence).toHaveLength(1);
      expect(r.finding.evidence[0]!.startMs).toBeGreaterThan(0);
    }
  });

  it('DROPS a significant finding with no evidence', () => {
    const r = verifyFinding({ ...good, evidence: [] }, en, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected.reason).toBe('no_evidence');
  });

  it('DROPS a finding whose quote is not in the transcript (hallucinated)', () => {
    const r = verifyFinding(
      { ...good, evidence: [{ quote: 'we cut mortality by half' }] }, en, opts,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected.reason).toBe('quote_not_found');
  });

  it('DROPS a finding quoting the persona instead of the user', () => {
    const r = verifyFinding(
      { ...good, evidence: [{ quote: 'What did you personally decide' }] }, en, opts,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected.reason).toBe('quote_not_found');
  });

  it('DROPS a finding missing any of the four required parts', () => {
    for (const part of ['finding', 'whyItMatters', 'recommendedChange', 'dimension'] as const) {
      const broken: Record<string, unknown> = { ...good };
      delete broken[part];
      const r = verifyFinding(broken, en, opts);
      expect(r.ok, `expected rejection when '${part}' missing`).toBe(false);
      if (!r.ok) expect(r.rejected.reason).toBe('missing_part');
    }
  });

  it('DROPS trait language in favour of observation language', () => {
    const r = verifyFinding(
      { ...good, finding: 'You are defensive when challenged.' }, en, opts,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected.reason).toBe('trait_language');
  });

  it('DROPS Arabic trait language too', () => {
    const r = verifyFinding(
      {
        dimension: 'pressure_integrity_ar',
        severity: 'significant',
        finding: 'أنت شخص دفاعي عند التحدي.',
        evidence: [{ quote: 'اعتقد اننا حسنا' }],
        whyItMatters: 'الانطباع سلبي.',
        recommendedChange: 'دافع عن الموقف.',
      }, ar, arOpts,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected.reason).toBe('trait_language');
  });

  it('allows a minor finding without evidence', () => {
    const r = verifyFinding({ ...good, severity: 'minor', evidence: [] }, en, opts);
    expect(r.ok).toBe(true);
  });

  it('flags an unverifiable number without dropping the finding', () => {
    const r = verifyFinding(
      { ...good, whyItMatters: 'This cost you 73 points of credibility.' }, en, opts,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.finding.numericReviewFlag).toBe(true);
  });

  it('does not flag a number that matches Pass 0 output', () => {
    const r = verifyFinding(
      { ...good, whyItMatters: 'You spoke at 150 words per minute throughout.' }, en, opts,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.finding.numericReviewFlag).toBeUndefined();
  });

  it('partitions a mixed batch into accepted and rejected', () => {
    const { accepted, rejected } = verifyFindings(
      [good, { ...good, evidence: [] }, { ...good, evidence: [{ quote: 'never said this at all' }] }],
      en, opts,
    );
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    expect(rejected.map((r) => r.reason).sort()).toEqual(['no_evidence', 'quote_not_found']);
  });
});

describe('trait-language detection is language-independent', () => {
  it('catches English trait language inside an Arabic session', () => {
    const r = verifyFinding(
      {
        dimension: 'pressure_integrity_ar',
        severity: 'significant',
        finding: 'You are defensive when challenged.',
        evidence: [{ quote: 'اعتقد اننا حسنا' }],
        whyItMatters: 'w', recommendedChange: 'r',
      }, ar, arOpts,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected.reason).toBe('trait_language');
  });

  it('catches Arabic trait language inside an English session', () => {
    const r = verifyFinding(
      {
        dimension: 'pressure_integrity',
        severity: 'significant',
        finding: 'أنت شخص دفاعي عند التحدي.',
        evidence: [{ quote: 'I think we probably improved' }],
        whyItMatters: 'w', recommendedChange: 'r',
      }, en, opts,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected.reason).toBe('trait_language');
  });
});
