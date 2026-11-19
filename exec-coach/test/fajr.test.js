// Cross-validates our Fajr engine against the `adhan` reference library (Umm al-Qura) for every day of 2026–2027.
import test from "node:test";
import assert from "node:assert/strict";
import * as adhan from "adhan";
import { fajrMinutes, sessionPlan, riyadhToday } from "../src/fajr.js";

const coords = new adhan.Coordinates(21.4225, 39.8262);
const params = adhan.CalculationMethod.UmmAlQura();

function adhanFajrMinutes(y, m, d) {
  const t = new adhan.PrayerTimes(coords, new Date(Date.UTC(y, m - 1, d, 12)), params).fajr;
  const local = new Date(t.getTime() + 3 * 3600_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60;
}

test("matches adhan Umm al-Qura within 2 minutes for 730 consecutive days", () => {
  let worst = 0;
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 730; i++) {
    const dt = new Date(start + i * 86400_000);
    const [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
    const diff = Math.abs(fajrMinutes(y, m, d) - adhanFajrMinutes(y, m, d));
    worst = Math.max(worst, diff);
  }
  console.log(`worst deviation vs adhan: ${worst.toFixed(2)} min`);
  assert.ok(worst < 2, `deviation ${worst}`);
});

test("session is exactly Fajr + 60 and 15 minutes long, with +03:00 offset", () => {
  const p = sessionPlan(2026, 11, 19);
  const toMin = (s) => +s.slice(0, 2) * 60 + +s.slice(3);
  assert.equal(toMin(p.sessionStart) - toMin(p.fajr), 60);
  assert.equal(toMin(p.sessionEnd) - toMin(p.sessionStart), 15);
  assert.match(p.startISO, /^2026-11-19T\d\d:\d\d:00\+03:00$/);
});

test("Fajr stays inside Makkah's plausible yearly range (04:00–05:50)", () => {
  for (let m = 1; m <= 12; m++) {
    const f = fajrMinutes(2026, m, 15);
    assert.ok(f > 240 && f < 350, `month ${m}: ${f}`);
  }
});

test("riyadhToday rolls over at Riyadh midnight, not device midnight", () => {
  assert.deepEqual(riyadhToday(new Date("2026-11-19T21:30:00Z")), { year: 2026, month: 11, day: 20 });
  assert.deepEqual(riyadhToday(new Date("2026-11-19T20:30:00Z")), { year: 2026, month: 11, day: 19 });
});
