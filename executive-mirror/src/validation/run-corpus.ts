/**
 * Runs the failure-mode corpus through Pass 0 and reports which modes the
 * DETERMINISTIC layer separates from the control on its own, and which
 * genuinely need the LLM passes.
 *
 * This distinction is the point. Anything the deterministic layer separates is
 * validated today and cannot regress silently. Anything marked requiresLlm is
 * UNVALIDATED until real providers run.
 */
import { computeMetrics, type Pass0Result } from '@/analysis/metrics';
import { loadLexicon, loadScenario } from '@/config/loader';
import { synthesiseWords } from '@/providers/mock';
import { CONTROL_MODE, SAMPLES, type Condition, type Sample } from './failure-modes';
import type { Lang, Transcript, Turn } from '@/lib/types';

export function transcriptFor(s: Sample): Transcript {
  let clock = 0;
  const turns: Turn[] = s.exchange.map(([speaker, text], index) => {
    clock += speaker === 'user' ? 900 : 400;
    const words = synthesiseWords(text, clock);
    const last = words[words.length - 1];
    const turn: Turn = {
      index, speaker, text,
      startMs: words[0]?.startMs ?? clock,
      endMs: last?.endMs ?? clock,
      words,
      latencyBeforeMs: speaker === 'user' ? 900 : 400,
      isChallenge: speaker === 'persona' && index > 0,
    };
    clock = turn.endMs;
    return turn;
  });
  return { sessionId: `${s.mode}-${s.condition}`, language: s.language, turns };
}

export function metricsFor(s: Sample): Pass0Result {
  const scenario = loadScenario('executive-interview');
  const rt = scenario.response_targets;
  return computeMetrics(transcriptFor(s), loadLexicon(s.language), {
    wordsPerResponse: {
      idealMin: rt.words_per_response.ideal_min,
      idealMax: rt.words_per_response.ideal_max,
      hardMax: rt.words_per_response.hard_max,
    },
    conclusionLatencyWords: {
      idealMax: rt.conclusion_latency_words[s.language].ideal_max,
      concernAbove: rt.conclusion_latency_words[s.language].concern_above,
    },
    responseDurationSeconds: {
      idealMin: rt.response_duration_seconds.ideal_min,
      idealMax: rt.response_duration_seconds.ideal_max,
    },
  });
}

/** The control sample for a given language, used as the comparison baseline. */
export function controlFor(language: Lang, condition?: Condition): Sample {
  const exact = SAMPLES.find(
    (s) => s.mode === CONTROL_MODE && s.language === language && (!condition || s.condition === condition),
  );
  return exact ?? SAMPLES.find((s) => s.mode === CONTROL_MODE && s.language === language)!;
}

export interface Separation {
  metric: string;
  control: number;
  sample: number;
  /** Ratio vs control; null when the control value is 0. */
  ratio: number | null;
  separated: boolean;
}

/**
 * A metric SEPARATES a sample from the control when it moves in the expected
 * direction by a margin wide enough not to be noise.
 *
 * Threshold reasoning: a 40% move on a rate metric is well outside the
 * variation two competent answers to the same question produce. For counts
 * where the control is 0 (apologies, hedges), any occurrence separates.
 */
const RATIO_MARGIN = 1.4;

export function separationFor(
  sample: Sample,
  direction: 'high' | 'low',
  metric: string,
): Separation {
  const c = metricsFor(controlFor(sample.language, sample.condition)).byKey[metric] ?? 0;
  const v = metricsFor(sample).byKey[metric] ?? 0;
  const ratio = c === 0 ? null : v / c;

  let separated: boolean;
  if (direction === 'high') {
    separated = c === 0 ? v > 0 : v >= c * RATIO_MARGIN;
  } else {
    separated = v === 0 ? c > 0 : c >= v * RATIO_MARGIN;
  }
  return { metric, control: c, sample: v, ratio, separated };
}

export interface ModeResult {
  sample: Sample;
  separations: Separation[];
  /** Every declared expectation held. */
  deterministicallySeparated: boolean;
  requiresLlm: boolean;
}

export function evaluateCorpus(): ModeResult[] {
  return SAMPLES.filter((s) => s.mode !== CONTROL_MODE).map((sample) => {
    const separations = [
      ...(sample.expect.high ?? []).map((m) => separationFor(sample, 'high', m)),
      ...(sample.expect.low ?? []).map((m) => separationFor(sample, 'low', m)),
    ];
    return {
      sample,
      separations,
      deterministicallySeparated: separations.length > 0 && separations.every((s) => s.separated),
      requiresLlm: Boolean(sample.expect.requiresLlm),
    };
  });
}
