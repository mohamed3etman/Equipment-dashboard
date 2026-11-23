# Implementation Roadmap

Each milestone ends with a demonstrable result and acceptance criteria. Nothing is marked done until it has been tested.

| # | Milestone | Deliverable | Acceptance criteria | Status |
|---|---|---|---|---|
| M0 | Phase 1: assessment and architecture | `docs/ARCHITECTURE.md`, tested Fajr engine | Fajr within 2 min of the reference for 730 days | ✅ Done (0.51 min worst) |
| M1 | **Voice loop spike (go/no-go for Option A)** | `app/voice-check.html`, published privately at claude.ai/artifact/XwxfjFad1gwtCzRxsaJsUF; logs per-turn latency to the `voicecheck` collection | On your machine: 5 voice turns with no errors; latency logged; capability fallbacks verified | ✅ Passed: 5/5 voice turns, 0 errors, 4.6 s average wait (Windows desktop app). iPhone confirmed typing-only |
| M2 | Coaching engine | Planner, Coach and orchestrator; all 6 segments; soft timer; transcript capture; Arabic-gloss rule | One full 15-min session end to end; one question at a time; role-play stays in character; ideal answer never leaked | ✅ Built; simulated journey passes. Published at claude.ai/artifact/Ry7116kRFar69jkGZ6CaMf. Awaiting first real session |
| M3 | Grader and scoring | Grader passes 1 and 2; deterministic metrics; pronunciation-N/A renormalisation; scorecard | Every score cites a transcript quote; the same transcript graded twice stays within ±5 points; corrections capped at 3 | 🟡 Built (evidence quotes, fluency cap, N/A pronunciation). The ±5 consistency check needs real transcripts |
| M4 | Learner memory and adaptation | db schema; error-pattern register; phrase spaced repetition; curriculum gates; weekly and monthly assessment days | Day 2 plan visibly targets day 1 weaknesses; due phrases reappear; stage gate logic unit-tested | 🟡 Partial: profile, recurring patterns, focus carry-over and assessment days done. Phrase spaced repetition and stage gates still to do |
| M5 | Fajr scheduling | "Executive Coach" calendar with per-day events; in-app next-session display | Event times match `sessionPlan()` for a sampled 30 days; notification received on your phone | |
| M6 | Progress dashboard | Daily, weekly and monthly trends; skill radar; mastered phrases; recurring weaknesses | Readable on laptop and phone; empty-state on day 1 | |
| M7 | Journey test and hardening | Scripted 3-day simulated journey; bug fixes; runbook | Resume after a closed tab works; no data loss; offline and denied-permission paths degrade gracefully | |
| M8 | (Optional) Mobile voice channel | ElevenLabs agent sharing the same plan and grading | Decided at the 2-week gate | |

## Working principles
- The coaching quality gate comes before UI polish. M2–M4 are judged on transcripts, not screenshots.
- Every prompt is versioned in `src/prompts/`, with decisions logged in `docs/ARCHITECTURE.md` §4.
- Golden-transcript fixtures in `test/fixtures/` (weak, average and strong answers) are used to check grader consistency.
