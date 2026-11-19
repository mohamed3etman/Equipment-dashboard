# Executive Communication Coach

A private, voice-first daily coach for executive English, communication and presence. One 15-minute session a day at **Fajr (Makkah) + 60 minutes**, Asia/Riyadh.

- Architecture, environment assessment and decisions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Milestones and acceptance criteria: [`docs/ROADMAP.md`](docs/ROADMAP.md)

## What works today
- `src/fajr.js` is a dependency-free Fajr engine using the Umm al-Qura method (18.5°). `sessionPlan(y, m, d)` returns the day's Fajr and the session window with a `+03:00` offset. It is validated against the `adhan` library for 730 days (worst deviation 0.51 min).

```bash
npm install
npm test
node -e 'import("./src/fajr.js").then(f => console.log(f.sessionPlan(2026, 11, 19)))'
```
