// Learner profile: what carries from one session to the next. Pure functions; the page persists the result in db.
import { STAGES } from "./engine.js";

export function emptyProfile() {
  return { version: 1, stage: 1, sessions: 0, history: [], recentThemes: [], recentPhrases: [], focus: [], errorPatterns: {} };
}

// Riyadh weekday 4 = Thursday (last working day): weekly assessment. First session of a calendar month: monthly assessment.
export function dayTypeFor(profile, date /* "YYYY-MM-DD" */, weekday /* 0=Sun */) {
  const lastMonth = profile.history.at(-1)?.date?.slice(0, 7);
  if (profile.sessions > 0 && lastMonth && lastMonth !== date.slice(0, 7)) return "monthly executive assessment: a demanding board-level scenario covering everything trained this month";
  if (weekday === 4 && profile.sessions >= 3) return "weekly assessment: slightly harder role-play that re-tests this week's focus skills";
  return "normal";
}

export function planInputs(profile) {
  return {
    stage: STAGES[(profile.stage || 1) - 1],
    recentThemes: profile.recentThemes.slice(-10),
    recentPhrases: profile.recentPhrases.slice(-30),
    focus: [
      ...profile.focus.slice(0, 2),
      ...Object.entries(profile.errorPatterns).filter(([, v]) => v.count >= 2).sort((a, b) => b[1].count - a[1].count).slice(0, 2).map(([k]) => `recurring: ${k}`),
    ],
  };
}

export function updateProfile(profile, { date, result, plan }) {
  const p = structuredClone(profile);
  p.sessions += 1;
  p.history = [...p.history, {
    date, theme: plan.theme, normalized: result.normalized, rawTotal: result.rawTotal,
    scores: Object.fromEntries(Object.entries(result.scores).map(([k, v]) => [k, v.score])),
    confidence: result.confidence?.score ?? null, durationMin: result.durationMin, avgWords: result.metrics.avgWordsPerAnswer,
  }].slice(-120);
  p.recentThemes = [...p.recentThemes, plan.theme].slice(-15);
  p.recentPhrases = [...p.recentPhrases, ...plan.phrases.map((x) => x.phrase)].slice(-60);
  p.focus = [result.tomorrowFocus].filter(Boolean);
  // count = number of SESSIONS in which the pattern appeared, so "recurring" means across days, not within one answer set.
  const seen = new Set();
  for (const c of result.corrections || []) {
    const key = (c.pattern || "").trim().toLowerCase();
    if (!key) continue;
    const e = p.errorPatterns[key] || { count: 0, examples: [], firstSeen: date };
    if (!seen.has(key)) { e.count += 1; seen.add(key); }
    e.lastSeen = date; e.examples = [...e.examples, c.said].slice(-5);
    p.errorPatterns[key] = e;
  }
  return p;
}
