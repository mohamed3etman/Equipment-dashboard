// Session orchestrator: Planner -> Coach turns per segment -> mid-session Grader -> final Grader.
// Pure logic with injected dependencies (sampleJson, now) so it runs identically in the page and in Node tests.
import { plannerPrompt, coachTurnPrompt, correctionAckPrompt, midGraderPrompt, finalGraderPrompt, PROMPT_VERSION } from "./prompts.js";
import { answerMetrics, sessionMetrics } from "./metrics.js";

export const STAGES = [
  { n: 1, name: "Fluency & Confidence", goal: "spontaneous speech, thinking in English, longer connected answers", roleplayDifficulty: 2 },
  { n: 2, name: "Executive Communication", goal: "concise executive summaries, decision language, diplomatic disagreement", roleplayDifficulty: 3 },
  { n: 3, name: "Leadership & People", goal: "feedback, motivation, difficult conversations, handling resistance", roleplayDifficulty: 3 },
  { n: 4, name: "Public Speaking & Storytelling", goal: "structure, hooks, stories, presenting data, strong conclusions", roleplayDifficulty: 3 },
  { n: 5, name: "Negotiation & Influence", goal: "persuasion, objections, stakeholder management, assertiveness", roleplayDifficulty: 4 },
  { n: 6, name: "Interviews & Career", goal: "STAR stories, achievements without arrogance, failures, salary negotiation", roleplayDifficulty: 4 },
  { n: 7, name: "Business & Investor", goal: "pitching Makeen, partnerships, commercial and financial language", roleplayDifficulty: 4 },
  { n: 8, name: "Advanced Executive Presence", goal: "board debate, thought leadership, pressure, complex ideas made simple", roleplayDifficulty: 5 },
];

export const SEGMENTS = [
  { id: "warmup", label: "Executive warm-up", endMin: 2, minAnswers: 1, maxAnswers: 2 },
  { id: "fluency", label: "Fluency challenge", endMin: 5, minAnswers: 1, maxAnswers: 2 },
  { id: "roleplay", label: "Executive role-play", endMin: 8, minAnswers: 3, maxAnswers: 4 },
  { id: "coaching", label: "Targeted coaching", endMin: 11, minAnswers: 0, maxAnswers: 3 },
  { id: "phrases", label: "Power phrases", endMin: 13, minAnswers: 1, maxAnswers: 2 },
  { id: "final", label: "Final challenge", endMin: 15, minAnswers: 1, maxAnswers: 1 },
];

export const SCORE_MAX = { fluency: 20, clarity: 20, vocabulary: 15, grammar: 15, executivePresence: 15 };

// Deterministic guard against inflated fluency: short answers cannot earn high fluency.
export function fluencyCap(avgWords) {
  if (avgWords < 20) return 10;
  if (avgWords < 35) return 13;
  if (avgWords < 50) return 16;
  return 20;
}

export function finalizeScores(raw, metrics) {
  const scores = {};
  let total = 0;
  for (const [k, max] of Object.entries(SCORE_MAX)) {
    const r = raw?.scores?.[k] || {};
    let s = Math.max(0, Math.min(max, Math.round(Number(r.score) || 0)));
    let capped = false;
    if (k === "fluency") { const cap = fluencyCap(metrics.avgWordsPerAnswer); if (s > cap) { s = cap; capped = true; } }
    scores[k] = { score: s, max, evidence: r.evidence || "", note: r.note || "", capped };
    total += s;
  }
  return {
    scores,
    pronunciation: { available: false, reason: "No audio access: speech-to-text only. Not scored." },
    rawTotal: total, outOf: 85,
    normalized: Math.round((total / 85) * 100),
  };
}

const say = (...parts) => parts.filter(Boolean).join(" ");
// Quote a spoken fragment without doubled punctuation: "We were delayed" rather than "We were delayed.".
const q = (t) => `"${String(t || "").trim().replace(/[.!?,;:]+$/, "")}"`;
const lowerFirst = (t) => String(t || "").replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase());
const fluencyIntro = (p) => say("Fluency challenge.", p.fluency.challenge, `You have about ${p.fluency.seconds} seconds. Take a breath and start when you're ready.`);
const roleplayIntro = (p) => say("Now a role-play.", p.roleplay.setup, `I'll be ${p.roleplay.counterpartRole}.`, p.roleplay.openingLine);
const correctionText = (c, i, n) => say(
  i === 0 ? `Let's sharpen three things.` : `Number ${i + 1}.`,
  `You said: ${q(c.said)}.`, c.issue, `More natural: ${q(c.natural)}.`, `At executive level: ${q(c.executive)}.`, "Say that back to me."
).replace("three things", n === 1 ? "one thing" : n === 2 ? "two things" : "three things");
const phrasesIntro = (p) => say(
  "Three power phrases for today.",
  ...p.phrases.map((x) => `${q(x.phrase)}: use it ${lowerFirst(x.useWhen.replace(/^use (it )?/i, "")).replace(/[.]+$/, "")}.`),
  `Now use one of them in a sentence about ${lowerFirst(p.theme)}.`
);
const finalIntro = (p) => say("Final challenge.", p.final.challenge, `About ${p.final.seconds} seconds. Go when you're ready.`);

export function createSession({ sampleJson, now = () => Date.now(), stage = STAGES[0], history = {}, name = "Mohamed", weekday = "" }) {
  const s = {
    promptVersion: PROMPT_VERSION, stage: stage.n, plan: null, seg: 0, answersInSeg: 0,
    transcript: [], corrections: [], corrIdx: 0, startedAt: null, done: false, result: null, segStartedAt: null,
    midGrader: null, log: [],
  };
  const seg = () => SEGMENTS[s.seg];
  const elapsedMin = () => (now() - s.startedAt) / 60000;
  const coach = (text, extra = {}) => { s.transcript.push({ seg: seg().id, role: "coach", text, t: now(), ...extra }); return text; };

  async function call(kind, prompt, opts) {
    const t0 = now();
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const v = await sampleJson(prompt, { kind, ...opts }); s.log.push({ kind, ms: now() - t0 }); return v; }
      catch (e) { if (attempt === 1 || e?.code === "rate_limited" || e?.code === "not_granted") throw e; }
    }
  }

  const segTranscript = (ids) => s.transcript.filter((x) => ids.includes(x.seg))
    .map((x) => `${x.role === "coach" ? (x.seg === "roleplay" && x.inRole ? s.plan.roleplay.counterpartRole.toUpperCase() : "COACH") : "MOHAMED"}: ${x.text}`).join("\n");

  function startMidGrader() {
    if (s.midGrader) return s.midGrader;
    const transcript = segTranscript(["warmup", "fluency", "roleplay"]);
    s.midGrader = call("midGrader", midGraderPrompt({ transcript, plan: s.plan }), { modelTier: "default" })
      .then((r) => (Array.isArray(r?.corrections) ? r.corrections.filter((c) => c?.said && c?.executive).slice(0, 3) : []))
      .catch(() => []);
    return s.midGrader;
  }

  // Enters segment i, stores its opening line under that segment, and returns the opening line.
  async function enter(i) {
    s.seg = i; s.answersInSeg = 0; s.segStartedAt = now();
    const p = s.plan;
    switch (SEGMENTS[i].id) {
      case "fluency": return coach(fluencyIntro(p));
      case "roleplay": return coach(roleplayIntro(p), { inRole: true });
      case "coaching": {
        s.corrections = await startMidGrader();
        s.corrIdx = 0;
        if (!s.corrections.length) return say(coach("Your language in that stretch was clean, so let's move straight to new material."), await enter(i + 1));
        return coach(correctionText(s.corrections[0], 0, s.corrections.length));
      }
      case "phrases": return coach(phrasesIntro(p));
      case "final": return coach(finalIntro(p));
    }
  }

  async function finish() {
    const answers = s.transcript.filter((x) => x.role === "me");
    const metrics = sessionMetrics(answers);
    const raw = await call("finalGrader", finalGraderPrompt({
      transcript: segTranscript(SEGMENTS.map((x) => x.id)), metrics, plan: s.plan, corrections: s.corrections,
    }), { modelTier: "complex" });
    const scored = finalizeScores(raw, metrics);
    s.done = true;
    s.result = {
      ...scored, metrics,
      confidence: raw?.confidence || null,
      strongest: raw?.strongest || null,
      roleplayModel: raw?.roleplayModel || "",
      phrasesUsed: raw?.phrasesUsed || [],
      tomorrowFocus: raw?.tomorrowFocus || "",
      corrections: s.corrections,
      phrases: s.plan.phrases,
      theme: s.plan.theme,
      durationMin: +elapsedMin().toFixed(1),
    };
    return coach(raw?.spokenSummary || "That's our session for today. Your scorecard is on screen.");
  }

  return {
    state: s,
    segment: () => seg(),
    async begin({ recentThemes, recentPhrases, focus, dayType } = {}) {
      s.startedAt = now(); s.segStartedAt = now();
      s.plan = await call("planner", plannerPrompt({ stage, recentThemes, recentPhrases, focus, dayType, weekday }), { modelTier: "default" });
      validatePlan(s.plan);
      return { say: coach(s.plan.warmupQuestion), segment: seg() };
    },

    // text: what he said; timing: {durationSec, eventTimes}. On any failure the state is rolled back so a retry is clean.
    async respond(text, timing = {}) {
      if (s.done) throw new Error("session finished");
      const snap = { len: s.transcript.length, answersInSeg: s.answersInSeg, corrIdx: s.corrIdx, seg: s.seg, done: s.done };
      try { return await this._respond(text, timing); }
      catch (e) { s.transcript.length = snap.len; Object.assign(s, { answersInSeg: snap.answersInSeg, corrIdx: snap.corrIdx, seg: snap.seg, done: snap.done }); throw e; }
    },

    // Speech recognition can deliver the last words after the coach has already replied to a snapshot.
    // Replace the stored answer when the settled text is longer, so grading uses the complete answer.
    amendLastAnswer(text, timing = {}) {
      for (let i = s.transcript.length - 1; i >= 0; i--) {
        const x = s.transcript[i];
        if (x.role !== "me") continue;
        if (answerMetrics(text).words > x.metrics.words) { x.text = text; x.metrics = answerMetrics(text, timing); return true; }
        x.metrics = answerMetrics(x.text, timing); return false;
      }
      return false;
    },

    async _respond(text, timing) {
      const cur = seg();
      s.transcript.push({ seg: cur.id, role: "me", text, t: now(), metrics: answerMetrics(text, timing) });
      s.answersInSeg++;
      const overTime = elapsedMin() > cur.endMin + 1;
      const atMax = s.answersInSeg >= cur.maxAnswers;
      const minReached = s.answersInSeg >= cur.minAnswers;
      const mustWrapUp = atMax || (overTime && minReached);

      if (cur.id === "final") { const closing = await finish(); return { say: closing, segment: cur, done: true, result: s.result }; }

      if (cur.id === "coaching") {
        const c = s.corrections[s.corrIdx];
        const hasNext = s.corrIdx + 1 < s.corrections.length && !(overTime && s.corrIdx >= 1);
        const ack = await call("ack", correctionAckPrompt({ correction: c, said: text, nextIntro: hasNext, name }), { modelTier: "quick" });
        s.corrIdx++;
        const ackText = ack?.say ? coach(ack.say) : "";
        if (hasNext) return { say: say(ackText, coach(correctionText(s.corrections[s.corrIdx], s.corrIdx, s.corrections.length))), segment: seg() };
        return { say: ackText, next: enter(s.seg + 1), segment: cur, arabicNote: "" };
      }

      const r = await call("coach", coachTurnPrompt({
        plan: s.plan, segment: cur.id, transcript: segTranscript([cur.id]), mustWrapUp, minReached, name,
      }), { modelTier: "default" });
      const reply = (r?.say || "").trim() || "Go on.";
      const advance = mustWrapUp || (minReached && r?.advance === true);
      // A role-play closing line steps out of character, so only mid-role-play lines are credited to the counterpart.
      coach(reply, cur.id === "roleplay" && !advance ? { inRole: true } : {});
      if (!advance) return { say: reply, segment: cur, arabicNote: r?.arabicNote || "" };
      // The closing line is returned at once; the next segment's opening (which may wait on grading) follows as `next`,
      // so the page speaks the closing line while corrections are being prepared.
      const next = enter(s.seg + 1);
      return { say: reply, next, segment: cur, arabicNote: r?.arabicNote || "" };
    },
  };
}

export function validatePlan(p) {
  const need = ["theme", "warmupQuestion", "fluency", "roleplay", "phrases", "final", "focusSkills"];
  for (const k of need) if (!p || p[k] == null) throw Object.assign(new Error("plan missing " + k), { code: "bad_plan" });
  if (!Array.isArray(p.phrases) || p.phrases.length < 1) throw Object.assign(new Error("plan has no phrases"), { code: "bad_plan" });
  p.phrases = p.phrases.slice(0, 3);
  p.fluency.seconds ||= 60; p.final.seconds ||= 45;
  p.roleplay.successCriteria ||= [];
  return p;
}
