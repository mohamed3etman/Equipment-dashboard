import test from "node:test";
import assert from "node:assert/strict";
import { createSession, SEGMENTS, finalizeScores, fluencyCap } from "../src/engine.js";
import { answerMetrics, sessionMetrics } from "../src/metrics.js";

const PLAN = {
  theme: "Defending a delayed EMR go-live",
  warmupQuestion: "What decision is taking most of your energy this week?",
  fluency: { challenge: "Explain why the go-live slipped, in 60 seconds.", seconds: 60 },
  roleplay: {
    setup: "You are meeting the Group CEO. You want two more months.", counterpartRole: "the Group CEO",
    counterpartStyle: "impatient, numbers-driven", hiddenAgenda: "promised the board a date",
    openingLine: "So, why should I tell the board we're late?", successCriteria: ["owns the delay", "gives a plan", "quantifies risk"],
  },
  phrases: [
    { phrase: "Let me put this into perspective.", useWhen: "before reframing a number", arabic: "خليني أوضح الصورة", example: "x" },
    { phrase: "The underlying issue is", useWhen: "to move from symptom to cause", arabic: "المشكلة الأساسية", example: "x" },
    { phrase: "What I'd ask us to consider is", useWhen: "to challenge without confrontation", arabic: "اللي أطلب نفكر فيه", example: "x" },
  ],
  final: { challenge: "Close the meeting with a 45-second recommendation.", seconds: 45 },
  focusSkills: ["conclusion-first answers", "handling pressure"],
};

function mockClaude({ corrections = 3, coachAdvance = true, raw } = {}) {
  const calls = [];
  const sampleJson = async (prompt, { kind }) => {
    calls.push({ kind, prompt });
    switch (kind) {
      case "planner": return structuredClone(PLAN);
      case "coach": return { say: `coach line ${calls.length}`, advance: coachAdvance, arabicNote: "" };
      case "ack": return { say: "Good, you kept 'underlying'." };
      case "midGrader": return { corrections: Array.from({ length: corrections }, (_, i) => ({
        said: `we did the thing ${i}`, category: "unnatural", issue: "Too vague.", natural: "We completed it.", executive: `We delivered phase ${i}.`, pattern: "vague verbs" })) };
      case "finalGrader": return raw ?? {
        scores: { fluency: { score: 19, evidence: "q" }, clarity: { score: 14, evidence: "q" }, vocabulary: { score: 11, evidence: "q" },
          grammar: { score: 12, evidence: "q" }, executivePresence: { score: 99, evidence: "q" } },
        confidence: { score: 6, outOf: 10, evidence: "hedging" }, strongest: { point: "owned the delay", quote: "q" },
        roleplayModel: "model", phrasesUsed: ["The underlying issue is"], tomorrowFocus: "Lead with the number.", spokenSummary: "Well done today.",
      };
    }
    throw new Error("unexpected kind " + kind);
  };
  return { sampleJson, calls };
}

const clock = () => { let t = Date.UTC(2026, 10, 24, 3, 15); return { now: () => t, tick: (sec) => { t += sec * 1000; } }; };
const ANSWER = "I think the main reason is that the vendor integration took longer than planned and we had to protect patient safety during cutover so we paused.";

async function runFullSession(opts = {}) {
  const c = clock(); const m = mockClaude(opts);
  const s = createSession({ sampleJson: m.sampleJson, now: c.now });
  const seen = [];
  const first = await s.begin();
  assert.equal(first.segment.id, "warmup");
  let guard = 0, res = { done: false };
  while (!res.done && guard++ < 40) {
    c.tick(opts.secPerTurn ?? 25);
    res = await s.respond(ANSWER, { durationSec: 20, eventTimes: [0, 1000, 5000, 6000] });
    if (res.next) await res.next;
    seen.push(s.segment().id);
  }
  return { s, m, res, seen, guard };
}

test("a full session walks all six segments in order and finishes", async () => {
  const { res, seen, m, s } = await runFullSession();
  assert.equal(res.done, true);
  const order = [...new Set(seen)];
  assert.deepEqual(order, ["fluency", "roleplay", "coaching", "phrases", "final"]);
  assert.ok(m.calls.length <= 20, `LLM calls bounded: ${m.calls.length}`);
  assert.equal(m.calls.filter((c) => c.kind === "midGrader").length, 1);
  assert.ok(s.state.transcript.some((x) => x.inRole), "role-play lines are attributed to the counterpart");
});

test("role-play needs at least three answers before it can close", async () => {
  const { s } = await runFullSession();
  const rp = s.state.transcript.filter((x) => x.seg === "roleplay" && x.role === "me");
  assert.ok(rp.length >= 3 && rp.length <= 4, `role-play answers: ${rp.length}`);
});

test("three corrections are delivered and each asks for a repeat", async () => {
  const { s } = await runFullSession();
  const lines = s.state.transcript.filter((x) => x.seg === "coaching" && x.role === "coach" && /Say that back to me/.test(x.text));
  assert.equal(lines.length, 3);
  assert.match(lines[0].text, /You said: "we did the thing 0"\./);
});

test("no corrections found -> coaching segment is skipped gracefully", async () => {
  const { res, seen } = await runFullSession({ corrections: 0 });
  assert.equal(res.done, true);
  assert.ok(!seen.includes("coaching") || seen.indexOf("phrases") > -1);
});

test("scores are clamped, fluency capped by measured answer length, pronunciation not scored", async () => {
  const { res } = await runFullSession();
  const r = res.result;
  assert.equal(r.scores.executivePresence.score, 15, "clamped to max");
  assert.equal(r.scores.fluency.score, fluencyCap(r.metrics.avgWordsPerAnswer));
  assert.equal(r.scores.fluency.capped, true);
  assert.equal(r.pronunciation.available, false);
  assert.equal(r.outOf, 85);
  assert.equal(r.normalized, Math.round((r.rawTotal / 85) * 100));
});

test("running over time forces the coach to wrap up the segment", async () => {
  const { m } = await runFullSession({ coachAdvance: false, secPerTurn: 200 });
  assert.ok(m.calls.some((c) => c.kind === "coach" && /close this segment NOW/.test(c.prompt)));
});

test("the coach never advances before a segment's minimum answers", async () => {
  const c = clock(); const m = mockClaude({ coachAdvance: true });
  const s = createSession({ sampleJson: m.sampleJson, now: c.now });
  await s.begin(); await s.respond(ANSWER); // warm-up -> fluency (min 1)
  await (await s.respond(ANSWER)).next;     // fluency -> roleplay
  assert.equal(s.segment().id, "roleplay");
  await s.respond(ANSWER); await s.respond(ANSWER);
  assert.equal(s.segment().id, "roleplay", "still in role-play after 2 answers despite advance:true");
});

test("malformed grader output still yields a valid, honest scorecard", () => {
  const r = finalizeScores({ scores: { fluency: { score: "abc" } } }, { avgWordsPerAnswer: 60 });
  assert.equal(r.rawTotal, 0);
  assert.equal(r.normalized, 0);
});

test("metrics: fillers, pauses, wpm and lexical diversity", () => {
  const a = answerMetrics("Um, you know, basically we uh finished it. We delivered.", { durationSec: 6, eventTimes: [0, 500, 4000, 4200] });
  assert.equal(a.hardFillers, 2); assert.equal(a.softFillers, 2); assert.equal(a.longPauses, 1); assert.equal(a.wpm, 100);
  const sm = sessionMetrics([{ text: "one two three", metrics: answerMetrics("one two three") }]);
  assert.equal(sm.totalWords, 3); assert.equal(sm.lexicalDiversity, 1);
});

test("segments cover exactly 15 minutes", () => {
  assert.equal(SEGMENTS.at(-1).endMin, 15);
});

test("a failed coach call rolls back so the retry does not duplicate the answer", async () => {
  const c = clock(); const m = mockClaude();
  let fail = true;
  const flaky = async (p, o) => { if (o.kind === "coach" && fail) { fail = false; throw Object.assign(new Error("x"), { code: "rate_limited" }); } return m.sampleJson(p, o); };
  const s = createSession({ sampleJson: flaky, now: c.now });
  await s.begin();
  await assert.rejects(s.respond(ANSWER));
  assert.equal(s.state.transcript.filter((x) => x.role === "me").length, 0);
  await s.respond(ANSWER);
  assert.equal(s.state.transcript.filter((x) => x.role === "me").length, 1);
});

test("amendLastAnswer keeps the longer settled transcript", async () => {
  const c = clock(); const m = mockClaude({ coachAdvance: false });
  const s = createSession({ sampleJson: m.sampleJson, now: c.now });
  await s.begin();
  await s.respond("We paused the go-live");
  assert.equal(s.amendLastAnswer("We paused the go-live to protect patients", { durationSec: 6 }), true);
  const me = s.state.transcript.filter((x) => x.role === "me").at(-1);
  assert.equal(me.metrics.words, 8); assert.equal(me.metrics.wpm, 80);
});
