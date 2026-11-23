import test from "node:test";
import assert from "node:assert/strict";
import { emptyProfile, updateProfile, planInputs, dayTypeFor } from "../src/profile.js";

const result = (pattern = "vague verbs") => ({
  normalized: 64, rawTotal: 54, durationMin: 15.5, tomorrowFocus: "Lead with the number.",
  scores: { fluency: { score: 13 }, clarity: { score: 12 }, vocabulary: { score: 10 }, grammar: { score: 10 }, executivePresence: { score: 9 } },
  confidence: { score: 6 }, metrics: { avgWordsPerAnswer: 31 },
  corrections: [{ said: "we did the thing", pattern }],
});
const plan = { theme: "EMR delay", phrases: [{ phrase: "Let me put this into perspective." }] };

test("profile accumulates history, themes, phrases and recurring patterns", () => {
  let p = emptyProfile();
  p = updateProfile(p, { date: "2026-11-24", result: result(), plan });
  p = updateProfile(p, { date: "2026-11-25", result: result("Vague verbs "), plan });
  assert.equal(p.sessions, 2);
  assert.equal(p.history.length, 2);
  assert.equal(p.errorPatterns["vague verbs"].count, 2);
  const inp = planInputs(p);
  assert.ok(inp.focus.includes("recurring: vague verbs"));
  assert.ok(inp.focus.includes("Lead with the number."));
  assert.equal(inp.stage.n, 1);
});

test("assessment days: Thursday weekly (after 3 sessions), first session of a new month", () => {
  const p = emptyProfile();
  assert.equal(dayTypeFor(p, "2026-11-26", 4), "normal");
  p.sessions = 3; p.history = [{ date: "2026-11-25" }];
  assert.match(dayTypeFor(p, "2026-11-26", 4), /^weekly/);
  assert.match(dayTypeFor(p, "2026-12-01", 2), /^monthly/);
});

test("the same pattern three times in one session counts as one session", () => {
  const r = result(); r.corrections = [1, 2, 3].map((i) => ({ said: "x" + i, pattern: "was/were" }));
  const p = updateProfile(emptyProfile(), { date: "2026-11-24", result: r, plan });
  assert.equal(p.errorPatterns["was/were"].count, 1);
  assert.equal(p.errorPatterns["was/were"].examples.length, 3);
  assert.ok(!planInputs(p).focus.some((f) => f.startsWith("recurring")));
});
