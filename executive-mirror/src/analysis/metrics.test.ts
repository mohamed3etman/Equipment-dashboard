import { describe, it, expect } from 'vitest';
import { computeMetrics } from './metrics';
import { loadLexicon } from '@/config/loader';
import { makeTranscript, makeTurn } from '@/lib/testing';

const enLex = loadLexicon('en');
const arLex = loadLexicon('ar');
const val = (ms: ReturnType<typeof computeMetrics>, k: string) => ms.byKey[k];

describe('Pass 0 — English', () => {
  it('computes WPM from word timings', () => {
    // 10 words at 400ms each = 4000ms = 150 wpm
    const t = makeTranscript('en', [
      makeTurn({ index: 0, speaker: 'user', text: 'one two three four five six seven eight nine ten' }),
    ]);
    expect(val(computeMetrics(t, enLex), 'words_per_minute')).toBe(150);
  });

  it('counts multi-word fillers once, not as their parts', () => {
    const t = makeTranscript('en', [
      makeTurn({ index: 0, speaker: 'user', text: 'we improved it you know across the group' }),
    ]);
    const m = computeMetrics(t, enLex);
    expect(val(m, 'filler_count')).toBe(1);
    const spans = m.metrics.find((x) => x.key === 'filler_count')?.spans ?? [];
    expect(spans[0]?.quote).toBe('you know');
  });

  it('only counts context-dependent fillers in discourse position', () => {
    // "like" as a verb should NOT count; "like" turn-initial should.
    const contentUse = makeTranscript('en', [
      makeTurn({ index: 0, speaker: 'user', text: 'the board did not like the proposal' }),
    ]);
    expect(val(computeMetrics(contentUse, enLex), 'filler_count')).toBe(0);

    const markerUse = makeTranscript('en', [
      makeTurn({ index: 0, speaker: 'user', text: 'like we rebuilt the whole register' }),
    ]);
    expect(val(computeMetrics(markerUse, enLex), 'filler_count')).toBe(1);
  });

  it('counts pauses and long pauses separately', () => {
    const t = makeTranscript('en', [
      makeTurn({
        index: 0, speaker: 'user',
        text: 'we reduced turnaround substantially across the group',
        pausesBefore: { 2: 400, 4: 2000 },   // one normal pause, one long
      }),
    ]);
    const m = computeMetrics(t, enLex);
    expect(val(m, 'pause_count')).toBe(2);
    expect(val(m, 'long_pause_count')).toBe(1);
  });

  it('detects quantified claims', () => {
    const t = makeTranscript('en', [
      makeTurn({ index: 0, speaker: 'user', text: 'turnaround fell from 48 hours to 2 hours and compliance reached 99.5%' }),
    ]);
    expect(val(computeMetrics(t, enLex), 'quantification_count')).toBeGreaterThanOrEqual(3);
  });

  it('measures conclusion latency — preamble delays the answer', () => {
    const direct = makeTranscript('en', [
      makeTurn({ index: 0, speaker: 'user', text: 'We cut turnaround to two hours.' }),
    ]);
    const delayed = makeTranscript('en', [
      makeTurn({
        index: 0, speaker: 'user',
        text: 'Well thank you for the question. So basically I think the context matters here. We cut turnaround to two hours.',
      }),
    ]);
    const a = val(computeMetrics(direct, enLex), 'conclusion_latency_words');
    const b = val(computeMetrics(delayed, enLex), 'conclusion_latency_words');
    expect(a).toBe(0);
    expect(b).toBeGreaterThan(a!);
  });

  it('computes talk/listen ratio against persona turns', () => {
    const t = makeTranscript('en', [
      makeTurn({ index: 0, speaker: 'persona', text: 'what changed' }),                    // 2 words
      makeTurn({ index: 1, speaker: 'user', text: 'we cut turnaround by ninety six percent', startMs: 1000 }), // 7 words
    ]);
    expect(val(computeMetrics(t, enLex), 'talk_listen_ratio')).toBe(3.5);
  });

  it('ignores persona speech in user metrics', () => {
    const t = makeTranscript('en', [
      makeTurn({ index: 0, speaker: 'persona', text: 'um so you know basically what changed' }),
    ]);
    const m = computeMetrics(t, enLex);
    expect(val(m, 'filler_count')).toBe(0);
    expect(val(m, 'response_count')).toBe(0);
  });
});

describe('Pass 0 — Arabic', () => {
  it('counts يعني as a filler', () => {
    const t = makeTranscript('ar', [
      makeTurn({ index: 0, speaker: 'user', text: 'احنا يعني حسنا زمن التقرير بشكل كبير' }),
    ]);
    expect(val(computeMetrics(t, arLex), 'filler_count')).toBe(1);
  });

  it('matches hedges despite diacritics and alef variants', () => {
    const t = makeTranscript('ar', [
      makeTurn({ index: 0, speaker: 'user', text: 'أعتقد أن النتيجة كانت ممكن أفضل' }),
    ]);
    // "اعتقد ان" (phrase) + "ممكن" (single)
    expect(val(computeMetrics(t, arLex), 'hedge_count')).toBe(2);
  });

  it('does NOT count courtesy markers as hedges or fillers', () => {
    const t = makeTranscript('ar', [
      makeTurn({ index: 0, speaker: 'user', text: 'سعادتكم أشكركم على السؤال خفضنا الزمن الى ساعتين' }),
    ]);
    const m = computeMetrics(t, arLex);
    expect(val(m, 'hedge_count')).toBe(0);
    expect(val(m, 'filler_count')).toBe(0);
  });

  it('detects Arabic-Indic numerals as quantification', () => {
    const t = makeTranscript('ar', [
      makeTurn({ index: 0, speaker: 'user', text: 'وصلنا الى ٩٩٫٥% في التقييم' }),
    ]);
    expect(val(computeMetrics(t, arLex), 'quantification_count')).toBeGreaterThanOrEqual(1);
  });

  it('counts code-switch events without penalising them', () => {
    const t = makeTranscript('ar', [
      makeTurn({ index: 0, speaker: 'user', text: 'طبقنا الـ governance framework على مستوى المجموعة' }),
    ]);
    const m = computeMetrics(t, arLex);
    expect(val(m, 'code_switch_events')).toBeGreaterThan(0);
    // Code-switching must not inflate filler or hedge counts.
    expect(val(m, 'filler_count')).toBe(0);
    expect(val(m, 'hedge_count')).toBe(0);
  });

  it('applies the Arabic-calibrated conclusion latency to a contextual opening', () => {
    const t = makeTranscript('ar', [
      makeTurn({ index: 0, speaker: 'user', text: 'شكرا على السؤال. خفضنا زمن التقرير من يومين الى ساعتين.' }),
    ]);
    // Courtesy opener is skipped; the claim is found after it.
    expect(val(computeMetrics(t, arLex), 'conclusion_latency_words')).toBeGreaterThan(0);
  });
});
