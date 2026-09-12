import type { Lang, Transcript, Turn, Word } from './types';
import { scriptOf } from '@/analysis/normalize';

/**
 * Build a transcript with synthetic but realistic word timings.
 * Words are spaced by `msPerWord`; an explicit `pauseBefore` map injects gaps
 * so pause and discourse-marker logic can be exercised deterministically.
 */
export function makeTurn(opts: {
  index: number;
  speaker: 'user' | 'persona';
  text: string;
  startMs?: number;
  msPerWord?: number;
  pausesBefore?: Record<number, number>;
  latencyBeforeMs?: number;
  isChallenge?: boolean;
}): Turn {
  const { index, speaker, text } = opts;
  const msPerWord = opts.msPerWord ?? 400;
  const pauses = opts.pausesBefore ?? {};
  let cursor = opts.startMs ?? 0;
  const words: Word[] = [];
  const tokens = text.split(/\s+/).filter(Boolean);

  tokens.forEach((tok, i) => {
    cursor += pauses[i] ?? 0;
    const w: Word = {
      text: tok,
      startMs: cursor,
      endMs: cursor + msPerWord,
      confidence: 0.95,
      script: scriptOf(tok),
    };
    words.push(w);
    cursor = w.endMs;
  });

  const first = words[0];
  const last = words[words.length - 1];
  return {
    index, speaker, text,
    startMs: first ? first.startMs : (opts.startMs ?? 0),
    endMs: last ? last.endMs : (opts.startMs ?? 0),
    words,
    latencyBeforeMs: opts.latencyBeforeMs,
    isChallenge: opts.isChallenge,
  };
}

export function makeTranscript(language: Lang, turns: Turn[], sessionId = 'test'): Transcript {
  return { sessionId, language, turns };
}
