// Fajr-anchored scheduling for Makkah (Umm al-Qura convention: Fajr at 18.5° sun depression).
// Dependency-free so the same file runs in the browser (artifact page) and in Node (tests, calendar seeding).
// Saudi Arabia observes no DST, so Asia/Riyadh is a fixed UTC+3.

export const MAKKAH = { lat: 21.4225, lng: 39.8262, utcOffsetHours: 3, fajrAngle: 18.5 };
export const SESSION_OFFSET_MIN = 60;

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function julianDay(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

// Sun declination (deg) and equation of time (hours) for a Julian day.
function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = (357.529 + 0.98560028 * D) % 360;
  const q = (280.459 + 0.98564736 * D) % 360;
  const L = (q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g))) % 360;
  const e = 23.439 - 0.00000036 * D;
  const RA = deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15;
  const decl = deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L))));
  let eqt = q / 15 - ((RA % 24) + 24) % 24;
  eqt = ((eqt + 12) % 24 + 24) % 24 - 12;
  return { decl, eqt };
}

// Returns Fajr as minutes after local midnight (Asia/Riyadh) for a civil date.
export function fajrMinutes(year, month, day, loc = MAKKAH) {
  // Two-pass refinement: evaluate the sun at the approximate Fajr instant.
  let t = 5; // hours, local
  for (let i = 0; i < 2; i++) {
    const jd = julianDay(year, month, day) + (t - loc.utcOffsetHours) / 24;
    const { decl, eqt } = sunPosition(jd);
    const noon = 12 + loc.utcOffsetHours - loc.lng / 15 - eqt;
    const cosH = (-Math.sin(rad(loc.fajrAngle)) - Math.sin(rad(loc.lat)) * Math.sin(rad(decl))) /
      (Math.cos(rad(loc.lat)) * Math.cos(rad(decl)));
    t = noon - deg(Math.acos(cosH)) / 15;
  }
  return t * 60;
}

const pad = (n) => String(n).padStart(2, "0");
export const fmt = (mins) => `${pad(Math.floor(mins / 60))}:${pad(Math.round(mins % 60) % 60)}`;

// Session start = Fajr (rounded up to the minute, matching published timetables) + 60 min.
export function sessionPlan(year, month, day, loc = MAKKAH) {
  const fajr = Math.ceil(fajrMinutes(year, month, day, loc));
  const start = fajr + SESSION_OFFSET_MIN;
  const date = `${year}-${pad(month)}-${pad(day)}`;
  return {
    date,
    fajr: fmt(fajr),
    sessionStart: fmt(start),
    sessionEnd: fmt(start + 15),
    // ISO with explicit +03:00 so any consumer (Calendar API, browser) gets the right instant.
    startISO: `${date}T${fmt(start)}:00+03:00`,
    endISO: `${date}T${fmt(start + 15)}:00+03:00`,
  };
}

// Today's date in Asia/Riyadh regardless of the device timezone.
export function riyadhToday(now = new Date()) {
  const r = new Date(now.getTime() + 3 * 3600_000);
  return { year: r.getUTCFullYear(), month: r.getUTCMonth() + 1, day: r.getUTCDate() };
}
