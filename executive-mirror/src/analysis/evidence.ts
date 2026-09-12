/**
 * Evidence enforcement. (V2 §14, §45.10)
 *
 * This module is the reason the product can be trusted. Prompt instructions
 * asking a model to cite evidence are followed most of the time; "most of the
 * time" is not good enough for a finding that tells a user how they came across.
 *
 * Every finding passes through `verifyFinding`. Anything that cannot be
 * anchored to a verbatim span in one of the USER's own turns is DROPPED and
 * recorded in `rejected`. Dropped findings are never shown as results.
 */
import { normalize } from './normalize';
import type {
  EvidenceSpan, Finding, RejectedFinding, Transcript, Turn,
} from '@/lib/types';

/** Trait language the rubric forbids (V2 §22 — observations, not diagnoses). */
const TRAIT_PATTERNS_EN = [
  /\byou are (?:a |an )?(?:very |quite |rather |somewhat )?(?:defensive|insecure|arrogant|weak|passive|aggressive|anxious|nervous|evasive|dishonest)\b/i,
  /\byou're (?:a |an )?(?:very |quite )?(?:defensive|insecure|arrogant|weak|passive|aggressive|anxious|nervous|evasive)\b/i,
  /\byou (?:always|never) \w+/i,
  /\byour personality\b/i,
  /\byou lack (?:confidence|conviction|presence|authority)\b/i,
];
// NOTE: JavaScript's \b is defined against [A-Za-z0-9_] and therefore NEVER
// matches at an Arabic character boundary. Using \b here would make every
// pattern below silently dead. Anchor on whitespace/string edges instead.
const AR_B = String.raw`(?:^|[\s.,!?؛،])`;
const AR_E = String.raw`(?=$|[\s.,!?؛،])`;
const arWord = (body: string) => new RegExp(AR_B + body + AR_E, 'u');

const TRAIT_PATTERNS_AR = [
  arWord(String.raw`انت\s+(?:شخص\s+)?(?:دفاعي|ضعيف|متردد|متكبر|قلق|مراوغ)`),
  arWord(String.raw`انت\s+دائما`),
  arWord(String.raw`انت\s+ابدا`),
  arWord(String.raw`تفتقر\s+(?:الى\s+)?(?:الثقه|الحضور|الحزم)`),
];

/**
 * Locate a quote inside the user's turns.
 * Matching is done on normalised text (so Arabic diacritics, tatweel and
 * digit-script differences do not cause false rejections), but the RETURNED
 * span always carries the speaker's original characters.
 */
export function locateQuote(
  quote: string,
  transcript: Transcript,
): EvidenceSpan | null {
  const needle = normalize(quote);
  if (needle.length < 2) return null;

  for (const turn of transcript.turns) {
    if (turn.speaker !== 'user') continue;      // rule: no_speaker_confusion
    const span = locateInTurn(needle, turn);
    if (span) return span;
  }
  return null;
}

function locateInTurn(needle: string, turn: Turn): EvidenceSpan | null {
  const words = turn.words;
  if (words.length === 0) {
    // Fall back to whole-turn text when word timings are unavailable.
    return normalize(turn.text).includes(needle)
      ? { turnIndex: turn.index, quote: turn.text, startMs: turn.startMs, endMs: turn.endMs }
      : null;
  }

  const norm = words.map((w) => normalize(w.text));
  // Sliding window over word runs. We compare joined normalised windows rather
  // than doing a substring search on the whole turn, because we need the word
  // indices to recover exact timings.
  for (let i = 0; i < words.length; i++) {
    let joined = '';
    for (let j = i; j < words.length; j++) {
      const nw = norm[j];
      if (nw) joined = joined ? `${joined} ${nw}` : nw;
      if (joined.length > needle.length + 40) break;   // window can no longer match
      if (joined === needle || joined.includes(needle)) {
        const slice = words.slice(i, j + 1);
        const first = slice[0];
        const last = slice[slice.length - 1];
        return {
          turnIndex: turn.index,
          quote: slice.map((w) => w.text).join(' '),
          startMs: first ? first.startMs : turn.startMs,
          endMs: last ? last.endMs : turn.endMs,
        };
      }
    }
  }
  return null;
}

export interface VerifyOptions {
  /** Pass 0 output. Numerics in prose are cross-checked against these. */
  metricsByKey: Record<string, number>;
  language: 'en' | 'ar';
}

export interface VerifyResult {
  accepted: Finding[];
  rejected: RejectedFinding[];
}

/**
 * Check BOTH language pattern sets regardless of the session language.
 * A model in an Arabic session can still emit English trait language (and vice
 * versa), so gating on the session language would leave a hole. Running both is
 * cheap and strictly safer.
 */
function hasTraitLanguage(text: string, _lang: 'en' | 'ar'): boolean {
  if (TRAIT_PATTERNS_EN.some((p) => p.test(text))) return true;
  const normalised = normalize(text);
  return TRAIT_PATTERNS_AR.some((p) => p.test(normalised));
}

/**
 * Cross-check numerics appearing in model prose against Pass 0.
 * We do not reject — a model may legitimately restate a metric we gave it, and
 * ordinals/years are common. We FLAG, so the UI can mark it and the debug view
 * can surface it. (V2 §45.8)
 */
function numericsUnmatched(text: string, byKey: Record<string, number>): boolean {
  const known = new Set(Object.values(byKey).map((v) => String(v)));
  const nums = text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  for (const n of nums) {
    if (known.has(n)) continue;
    const v = Number(n);
    // Ignore small ordinals and plausible year/duration references.
    if (v <= 10 || (v >= 1900 && v <= 2100)) continue;
    // Allow rounded restatements of a known metric.
    if ([...known].some((k) => Math.abs(Number(k) - v) <= 1)) continue;
    return true;
  }
  return false;
}

export function verifyFinding(
  raw: unknown,
  transcript: Transcript,
  opts: VerifyOptions,
): { ok: true; finding: Finding } | { ok: false; rejected: RejectedFinding } {
  const f = raw as Partial<Finding> & { evidence?: Array<{ quote?: string } | string> };

  // rule: four_part_finding
  const missing: string[] = [];
  if (!f.finding?.trim()) missing.push('finding');
  if (!f.whyItMatters?.trim()) missing.push('whyItMatters');
  if (!f.recommendedChange?.trim()) missing.push('recommendedChange');
  if (!f.dimension?.trim()) missing.push('dimension');
  if (missing.length) {
    return { ok: false, rejected: { reason: 'missing_part', raw, detail: `missing: ${missing.join(', ')}` } };
  }

  const severity: Finding['severity'] = f.severity ?? 'significant';

  // rule: no_permanent_traits
  const prose = `${f.finding} ${f.whyItMatters} ${f.recommendedChange}`;
  if (hasTraitLanguage(prose, opts.language)) {
    return { ok: false, rejected: { reason: 'trait_language', raw, detail: 'trait-style claim about the person rather than the response' } };
  }

  // rule: quote_required (severity >= significant)
  const rawEvidence = f.evidence ?? [];
  if (severity !== 'minor' && rawEvidence.length === 0) {
    return { ok: false, rejected: { reason: 'no_evidence', raw, detail: `severity '${severity}' requires at least one evidence quote` } };
  }

  // rules: verbatim_match, timestamp_anchored, no_speaker_confusion
  const anchored: EvidenceSpan[] = [];
  const unlocatable: string[] = [];
  for (const e of rawEvidence) {
    const quote = typeof e === 'string' ? e : e?.quote;
    if (!quote) continue;
    const span = locateQuote(quote, transcript);
    if (span) anchored.push(span);
    else unlocatable.push(quote);
  }

  if (severity !== 'minor' && anchored.length === 0) {
    return {
      ok: false,
      rejected: {
        reason: 'quote_not_found',
        raw,
        detail: `no supplied quote could be located in a user turn: ${unlocatable.map((q) => JSON.stringify(q.slice(0, 60))).join(', ')}`,
      },
    };
  }

  return {
    ok: true,
    finding: {
      dimension: f.dimension!,
      severity,
      finding: f.finding!.trim(),
      evidence: anchored,
      whyItMatters: f.whyItMatters!.trim(),
      recommendedChange: f.recommendedChange!.trim(),
      numericReviewFlag: numericsUnmatched(prose, opts.metricsByKey) || undefined,
    },
  };
}

export function verifyFindings(
  raws: unknown[],
  transcript: Transcript,
  opts: VerifyOptions,
): VerifyResult {
  const accepted: Finding[] = [];
  const rejected: RejectedFinding[] = [];
  for (const r of raws) {
    const res = verifyFinding(r, transcript, opts);
    if (res.ok) accepted.push(res.finding);
    else rejected.push(res.rejected);
  }
  return { accepted, rejected };
}

/** Anchor a bare quote list (used for mirror perceptions and dimension rationales). */
export function anchorQuotes(quotes: unknown, transcript: Transcript): EvidenceSpan[] {
  if (!Array.isArray(quotes)) return [];
  const out: EvidenceSpan[] = [];
  for (const q of quotes) {
    const text = typeof q === 'string' ? q : (q as { quote?: string })?.quote;
    if (!text) continue;
    const span = locateQuote(text, transcript);
    if (span) out.push(span);
  }
  return out;
}
