// Deterministic speech metrics computed from dictation text and timing. No LLM involved.
// Caveat: speech recognition often drops "um/uh", so hard-filler counts are a lower bound.

const HARD_FILLERS = /\b(um+|uh+|erm+|er|ah+|hmm+)\b/gi;
const SOFT_FILLERS = /\b(you know|i mean|basically|actually|sort of|kind of|so yeah)\b/gi;

export const words = (t) => (t.toLowerCase().match(/[a-z0-9']+/g) || []);

// timing: { durationSec, eventTimes: [ms timestamps of recognised speech updates] }
export function answerMetrics(text, timing = {}) {
  const w = words(text);
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const m = {
    words: w.length,
    hardFillers: (text.match(HARD_FILLERS) || []).length,
    softFillers: (text.match(SOFT_FILLERS) || []).length,
    sentences: sentences.length,
    avgSentenceWords: sentences.length ? +(w.length / sentences.length).toFixed(1) : w.length,
    durationSec: timing.durationSec ?? null,
    wpm: null,
    longPauses: null,
  };
  if (timing.durationSec >= 5 && w.length) m.wpm = Math.round(w.length / (timing.durationSec / 60));
  if (Array.isArray(timing.eventTimes) && timing.eventTimes.length > 1) {
    let long = 0;
    for (let i = 1; i < timing.eventTimes.length; i++) if (timing.eventTimes[i] - timing.eventTimes[i - 1] > 2500) long++;
    m.longPauses = long;
  }
  return m;
}

// Moving-average type-token ratio (window 40): length-independent lexical diversity.
export function mattr(allWords, win = 40) {
  if (allWords.length === 0) return null;
  if (allWords.length <= win) return +(new Set(allWords).size / allWords.length).toFixed(2);
  let sum = 0, n = 0;
  for (let i = 0; i + win <= allWords.length; i++) { sum += new Set(allWords.slice(i, i + win)).size / win; n++; }
  return +(sum / n).toFixed(2);
}

export function sessionMetrics(answers) {
  // answers: [{text, metrics}]
  const all = answers.flatMap((a) => words(a.text));
  const ms = answers.map((a) => a.metrics);
  const voiced = ms.filter((m) => m.wpm != null);
  const total = all.length;
  return {
    answers: answers.length,
    totalWords: total,
    avgWordsPerAnswer: answers.length ? Math.round(total / answers.length) : 0,
    longestAnswerWords: Math.max(0, ...ms.map((m) => m.words)),
    avgWpm: voiced.length ? Math.round(voiced.reduce((a, m) => a + m.wpm, 0) / voiced.length) : null,
    fillersPer100Words: total ? +((ms.reduce((a, m) => a + m.hardFillers + m.softFillers, 0) / total) * 100).toFixed(1) : 0,
    longPauses: ms.some((m) => m.longPauses != null) ? ms.reduce((a, m) => a + (m.longPauses || 0), 0) : null,
    lexicalDiversity: mattr(all),
    fillerNote: "lower bound: speech recognition may drop um/uh",
  };
}
