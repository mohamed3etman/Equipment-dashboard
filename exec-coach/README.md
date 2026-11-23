# Executive Communication Coach

A private, voice-first daily coach for executive English, communication and presence. One 15-minute session a day at **Fajr (Makkah) + 60 minutes**, Asia/Riyadh.

- Architecture, environment assessment and decisions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Milestones and acceptance criteria: [`docs/ROADMAP.md`](docs/ROADMAP.md)

## Use it
- **Daily coach:** https://claude.ai/artifact/Ry7116kRFar69jkGZ6CaMf (private). Use a computer with Chrome or the Claude desktop app.
- Voice check (M1): https://claude.ai/artifact/XwxfjFad1gwtCzRxsaJsUF

## Code map
- `app/coach.html`: the session app (UI, voice, persistence).
- `src/engine.js`: session orchestrator (Planner, Coach, graders), segments, scoring rules.
- `src/prompts.js`: all prompts, versioned.
- `src/metrics.js`: measured speech metrics (no LLM).
- `src/profile.js`: learner profile, recurring patterns, assessment days.
- `src/fajr.js`: Fajr + 60 scheduling.

Publish: `app/coach.html` plus the `src/*.js` files at the artifact root (they import each other relatively).

## What works today
- `src/fajr.js` is a dependency-free Fajr engine using the Umm al-Qura method (18.5°). `sessionPlan(y, m, d)` returns the day's Fajr and the session window with a `+03:00` offset. It is validated against the `adhan` library for 730 days (worst deviation 0.51 min).

```bash
npm install
npm test
node -e 'import("./src/fajr.js").then(f => console.log(f.sessionPlan(2026, 11, 19)))'
```
