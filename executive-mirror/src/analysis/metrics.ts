/**
 * Pass 0 — deterministic speech analytics. NO LLM. (V2 §12, §16)
 *
 * Everything here is reproducible: same transcript in, same numbers out.
 * Metrics are tiered `objective` (pure arithmetic over timings) or
 * `semi_objective` (deterministic, but the RULE embeds a judgment — e.g. which
 * words count as fillers). The tier travels with the metric so the UI can keep
 * them visually separate from AI inference, as V2 §12 requires.
 */
import type { Lexicon } from '@/config/schema';
import { normalize, normalizeToken, scriptOf } from './normalize';
import type { EvidenceSpan, Lang, Metric, Transcript, Turn, Word } from '@/lib/types';

const PAUSE_MIN_MS = 250;
/** A gap this long or longer reads as a stall rather than a breath. */
const LONG_PAUSE_MS = 1500;

function userTurns(t: Transcript): Turn[] {
  return t.turns.filter((x) => x.speaker === 'user');
}

function speakingMs(turns: Turn[]): number {
  return turns.reduce((acc, t) => acc + Math.max(0, t.endMs - t.startMs), 0);
}

function wordCount(turns: Turn[]): number {
  return turns.reduce((acc, t) => acc + t.words.length, 0);
}

/** Build an evidence span from a contiguous run of words inside one turn. */
function spanFromWords(turn: Turn, from: number, to: number): EvidenceSpan {
  const slice = turn.words.slice(from, to + 1);
  const first = slice[0];
  const last = slice[slice.length - 1];
  return {
    turnIndex: turn.index,
    quote: slice.map((w) => w.text).join(' '),
    startMs: first ? first.startMs : turn.startMs,
    endMs: last ? last.endMs : turn.endMs,
  };
}

/**
 * Match single-word and multi-word lexicon entries against a turn's words.
 * Context-dependent entries (e.g. "like", "بس") only count in discourse-marker
 * position: turn-initial, or preceded by a pause >= 200ms. Without this the
 * filler count is dominated by legitimate content uses of the same words.
 */
function matchLexicon(
  turn: Turn,
  single: string[],
  phrases: string[][],
  contextDependent: Set<string>,
): EvidenceSpan[] {
  const spans: EvidenceSpan[] = [];
  const norm = turn.words.map((w) => normalizeToken(w.text));
  const singleSet = new Set(single.map(normalizeToken));
  const consumed = new Set<number>();

  // Multi-word first — longest match wins, so "sort of" is not double-counted
  // as the single-word filler "sort".
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  for (const phrase of sorted) {
    const p = phrase.map(normalizeToken).filter(Boolean);
    if (p.length === 0) continue;
    for (let i = 0; i + p.length <= norm.length; i++) {
      if (consumed.has(i)) continue;
      let hit = true;
      for (let j = 0; j < p.length; j++) {
        if (norm[i + j] !== p[j]) { hit = false; break; }
      }
      if (!hit) continue;
      for (let j = 0; j < p.length; j++) consumed.add(i + j);
      spans.push(spanFromWords(turn, i, i + p.length - 1));
    }
  }

  for (let i = 0; i < norm.length; i++) {
    if (consumed.has(i)) continue;
    const tok = norm[i];
    if (!tok || !singleSet.has(tok)) continue;
    if (contextDependent.has(tok)) {
      const prev = turn.words[i - 1];
      const cur = turn.words[i];
      const atStart = i === 0;
      const afterPause = prev && cur ? cur.startMs - prev.endMs >= 200 : false;
      if (!atStart && !afterPause) continue;
    }
    consumed.add(i);
    spans.push(spanFromWords(turn, i, i));
  }
  return spans;
}

function collect(
  turns: Turn[],
  lex: Lexicon,
  group: 'fillers' | 'hedges' | 'apologies' | 'ownership_positive',
): EvidenceSpan[] {
  const g = lex[group];
  if (!g) return [];
  const single = 'single' in g && g.single ? g.single : [];
  const phrases = 'phrases' in g && g.phrases ? g.phrases : [];
  const ctx = new Set(
    ('context_dependent' in g && g.context_dependent ? g.context_dependent : []).map(normalizeToken),
  );
  return turns.flatMap((t) => matchLexicon(t, single, phrases, ctx));
}

/** Pauses inside a single turn — gaps between consecutive words. */
function intraTurnPauses(turns: Turn[]): { gaps: number[]; longSpans: EvidenceSpan[] } {
  const gaps: number[] = [];
  const longSpans: EvidenceSpan[] = [];
  for (const t of turns) {
    for (let i = 1; i < t.words.length; i++) {
      const prev = t.words[i - 1];
      const cur = t.words[i];
      if (!prev || !cur) continue;
      const gap = cur.startMs - prev.endMs;
      if (gap >= PAUSE_MIN_MS) {
        gaps.push(gap);
        if (gap >= LONG_PAUSE_MS) {
          longSpans.push({
            turnIndex: t.index,
            quote: `${prev.text} … ${cur.text}`,
            startMs: prev.endMs,
            endMs: cur.startMs,
          });
        }
      }
    }
  }
  return { gaps, longSpans };
}

/**
 * Conclusion latency — words before the response's first assertive claim.
 * V2 §13 / rubric `conclusion_positioning`. The flagship metric.
 *
 * Heuristic and deliberately conservative: we locate the first sentence that
 * is NOT purely preamble. Preamble = opens with courtesy, gratitude, a hedge,
 * or a restatement of the question. This is semi-objective by construction —
 * the rule embeds a judgment — and is tiered accordingly.
 */
function conclusionLatency(turn: Turn, lex: Lexicon, lang: Lang): number {
  const preambleOpeners = new Set<string>([
    ...(lex.hedges?.single ?? []),
    ...(lex.courtesy_markers?.deference ?? []),
    ...(lex.courtesy_markers?.gratitude ?? []),
    ...(lex.courtesy_markers?.religious ?? []),
    ...(lang === 'en' ? ['well', 'so', 'okay', 'right', 'thank', 'thanks', 'great', 'sure'] : []),
    ...(lang === 'ar' ? ['طيب', 'شكرا', 'اولا', 'بدايه', 'كما تعلمون'] : []),
  ].map(normalize).filter(Boolean));

  // Split into sentences by terminal punctuation in the ORIGINAL text, then
  // walk word-by-word so the returned count is in words, not characters.
  const words = turn.words;
  let i = 0;
  while (i < words.length) {
    // Look at the first up-to-4 tokens of this sentence.
    const head: string[] = [];
    let j = i;
    while (j < words.length && head.length < 4) {
      const w = words[j];
      if (!w) break;
      head.push(normalizeToken(w.text));
      j++;
    }
    const isPreamble = head.some((h) => h && preambleOpeners.has(h));
    if (!isPreamble) return i;

    // Advance past this sentence.
    let k = j;
    while (k < words.length) {
      const w = words[k];
      k++;
      if (w && /[.!?۔؟]$/.test(w.text)) break;
    }
    if (k === i) break; // no progress guard
    i = k;
  }
  return i >= words.length ? words.length : i;
}

function countPatterns(text: string, patterns: string[]): number {
  const t = normalize(text);
  let n = 0;
  for (const p of patterns) {
    try {
      const re = new RegExp(p, 'gi');
      n += (t.match(re) ?? []).length;
    } catch { /* a malformed pattern in config must not crash analysis */ }
  }
  return n;
}

function codeSwitchEvents(turns: Turn[]): number {
  let events = 0;
  for (const t of turns) {
    let prev: string | null = null;
    for (const w of t.words) {
      const s = scriptOf(w.text);
      if (s === 'other') continue;
      if (prev && prev !== s) events++;
      prev = s;
    }
  }
  return events;
}

export interface Pass0Result {
  metrics: Metric[];
  /** Keyed lookup used by the evidence verifier's numeric cross-check. */
  byKey: Record<string, number>;
}

export function computeMetrics(
  transcript: Transcript,
  lex: Lexicon,
  targets?: {
    wordsPerResponse?: { idealMin?: number; idealMax?: number; hardMax?: number };
    conclusionLatencyWords?: { idealMax?: number; concernAbove?: number };
    responseDurationSeconds?: { idealMin?: number; idealMax?: number };
  },
): Pass0Result {
  const lang = transcript.language;
  const uTurns = userTurns(transcript);
  const pTurns = transcript.turns.filter((t) => t.speaker === 'persona');

  const totalWords = wordCount(uTurns);
  const totalSpeakMs = speakingMs(uTurns);
  const totalSpeakMin = totalSpeakMs / 60000;

  const { gaps, longSpans } = intraTurnPauses(uTurns);
  const fillerSpans = collect(uTurns, lex, 'fillers');
  const hedgeSpans = collect(uTurns, lex, 'hedges');
  const apologySpans = collect(uTurns, lex, 'apologies');
  const ownershipSpans = collect(uTurns, lex, 'ownership_positive');

  const responseWordCounts = uTurns.map((t) => t.words.length);
  const responseDurations = uTurns.map((t) => (t.endMs - t.startMs) / 1000);
  const latencies = uTurns.map((t) => t.latencyBeforeMs).filter((x): x is number => typeof x === 'number');

  const quantPatterns = lex.quantification_markers?.patterns ?? [];
  const quantCount = uTurns.reduce((a, t) => a + countPatterns(t.text, quantPatterns), 0);

  const jargonTerms = Object.values(lex.jargon ?? {}).flat().map(normalize).filter(Boolean);
  const jargonSet = new Set(jargonTerms);
  const jargonHits = uTurns.reduce(
    (a, t) => a + t.words.filter((w) => jargonSet.has(normalizeToken(w.text))).length, 0,
  );

  const concLatencies = uTurns.map((t) => conclusionLatency(t, lex, lang));
  const meanConc = concLatencies.length
    ? concLatencies.reduce((a, b) => a + b, 0) / concLatencies.length : 0;

  const longestMonologue = uTurns.reduce((m, t) => Math.max(m, t.endMs - t.startMs), 0);
  const personaMs = speakingMs(pTurns);

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const r1 = (n: number) => Math.round(n * 10) / 10;

  const metrics: Metric[] = [
    { key: 'words_per_minute', label: 'Words per minute', unit: 'wpm', tier: 'objective',
      value: totalSpeakMin > 0 ? Math.round(totalWords / totalSpeakMin) : 0 },
    { key: 'total_speaking_seconds', label: 'Total speaking time', unit: 's', tier: 'objective',
      value: Math.round(totalSpeakMs / 1000) },
    { key: 'response_count', label: 'Responses', unit: '', tier: 'objective', value: uTurns.length },
    { key: 'words_per_response_mean', label: 'Words per response (mean)', unit: 'words', tier: 'objective',
      value: Math.round(mean(responseWordCounts)),
      target: targets?.wordsPerResponse ? { idealMin: targets.wordsPerResponse.idealMin, idealMax: targets.wordsPerResponse.idealMax } : undefined },
    { key: 'words_per_response_max', label: 'Longest response', unit: 'words', tier: 'objective',
      value: responseWordCounts.length ? Math.max(...responseWordCounts) : 0 },
    { key: 'response_duration_mean_s', label: 'Response duration (mean)', unit: 's', tier: 'objective',
      value: r1(mean(responseDurations)),
      target: targets?.responseDurationSeconds },
    { key: 'longest_monologue_s', label: 'Longest uninterrupted stretch', unit: 's', tier: 'objective',
      value: r1(longestMonologue / 1000) },
    { key: 'pause_count', label: 'Pauses (>= 250ms)', unit: '', tier: 'objective', value: gaps.length },
    { key: 'pause_mean_ms', label: 'Mean pause', unit: 'ms', tier: 'objective', value: Math.round(mean(gaps)) },
    { key: 'long_pause_count', label: 'Long pauses (>= 1.5s)', unit: '', tier: 'objective',
      value: longSpans.length, spans: longSpans },
    { key: 'response_latency_mean_ms', label: 'Time to start answering', unit: 'ms', tier: 'objective',
      value: Math.round(mean(latencies)) },
    { key: 'talk_listen_ratio', label: 'Talk / listen ratio', unit: ':1', tier: 'objective',
      value: personaMs > 0 ? r1(totalSpeakMs / personaMs) : 0 },
    { key: 'code_switch_events', label: 'Language switches', unit: '', tier: 'objective',
      value: codeSwitchEvents(uTurns) },

    { key: 'filler_count', label: 'Filler words', unit: '', tier: 'semi_objective',
      ruleVersion: `lexicon.${lang}.v${lex.version}`, value: fillerSpans.length, spans: fillerSpans },
    { key: 'filler_rate_per_100w', label: 'Filler rate', unit: '/100w', tier: 'semi_objective',
      ruleVersion: `lexicon.${lang}.v${lex.version}`,
      value: totalWords > 0 ? r1((fillerSpans.length / totalWords) * 100) : 0 },
    { key: 'hedge_count', label: 'Hedging phrases', unit: '', tier: 'semi_objective',
      ruleVersion: `lexicon.${lang}.v${lex.version}`, value: hedgeSpans.length, spans: hedgeSpans },
    { key: 'hedge_density_per_100w', label: 'Hedge density', unit: '/100w', tier: 'semi_objective',
      ruleVersion: `lexicon.${lang}.v${lex.version}`,
      value: totalWords > 0 ? r1((hedgeSpans.length / totalWords) * 100) : 0 },
    { key: 'apology_count', label: 'Apologies', unit: '', tier: 'semi_objective',
      ruleVersion: `lexicon.${lang}.v${lex.version}`, value: apologySpans.length, spans: apologySpans },
    { key: 'ownership_marker_count', label: 'Ownership statements', unit: '', tier: 'semi_objective',
      ruleVersion: `lexicon.${lang}.v${lex.version}`, value: ownershipSpans.length, spans: ownershipSpans },
    { key: 'quantification_count', label: 'Quantified claims', unit: '', tier: 'semi_objective',
      ruleVersion: `lexicon.${lang}.v${lex.version}`, value: quantCount },
    { key: 'quantification_per_minute', label: 'Evidence density', unit: '/min', tier: 'semi_objective',
      ruleVersion: `lexicon.${lang}.v${lex.version}`,
      value: totalSpeakMin > 0 ? r1(quantCount / totalSpeakMin) : 0 },
    { key: 'jargon_density_per_100w', label: 'Domain jargon density', unit: '/100w', tier: 'semi_objective',
      ruleVersion: `lexicon.${lang}.v${lex.version}`,
      value: totalWords > 0 ? r1((jargonHits / totalWords) * 100) : 0 },
    { key: 'conclusion_latency_words', label: 'Words before your answer', unit: 'words', tier: 'semi_objective',
      ruleVersion: `lexicon.${lang}.v${lex.version}`, value: Math.round(meanConc),
      target: targets?.conclusionLatencyWords },
  ];

  const byKey: Record<string, number> = {};
  for (const m of metrics) byKey[m.key] = m.value;
  return { metrics, byKey };
}
