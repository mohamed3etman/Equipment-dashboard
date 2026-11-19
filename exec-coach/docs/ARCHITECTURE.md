# Executive Communication Coach — Phase 1: Assessment & Architecture

Status: Phase 1 complete · 2026-11-19 · Owner: Dr. Mohamed Etman

## 1. Conclusion first

**Build it as a private claude.ai Artifact (a hosted web app), with Claude as the coaching brain, built-in voice in and out, and a server-side learner database. Schedule it through Google Calendar at Fajr + 60 min, computed per day.**

- **No hosting, no API keys, no monthly bill.** It runs on your Claude account and stays private unless you share it.
- **Voice-first, turn-based.** The coach speaks, you tap and speak, it responds. It is not full-duplex like a phone call (see §5).
- **Honest scoring.** The app gets your words but not your audio. Pronunciation is shown as "N/A", never invented, and the score is reweighted openly.
- **Main constraint: use a laptop/desktop.** Chrome or the Claude desktop app. The Claude mobile apps can't speak to you yet. If mobile matters, the fallback is an ElevenLabs voice agent (§6, Option B).

## 2. Environment assessment (what I actually tested)

| Capability | Finding | Evidence |
|---|---|---|
| Hosting | This dev container is ephemeral and can't host anything. **claude.ai Artifacts** give a private hosted URL with a runtime. | Container docs; Artifact tool |
| Coaching intelligence | Artifact `sample` capability calls Claude from inside the page, under your account. No API key in code. Supports structured JSON output and model tiers. | `sample.d.ts`, contract 0.2.96 |
| Voice output | Artifact `tts`: Claude voices (4 voices, rate 0.7–1.5×). **Not available in Safari, Firefox or the Claude mobile apps.** | `tts.d.ts` |
| Voice input | Artifact `dictation`: live speech-to-text (partial and final text). Works in Chromium browser tabs and the Claude desktop app. **Text only, no raw audio.** | `dictation.d.ts` |
| Simultaneous speak/listen | Not supported: `speak()` rejects `busy` while dictating. So the conversation is turn-based. | `tts.d.ts` |
| Persistence | Artifact `db`: server-side documents with access rules. `data/users/<id>/` is private to you, even from the artifact's owner role. Survives republishes. | `db.d.ts` |
| Prayer-time APIs | `api.aladhan.com` is **blocked** by the network policy. Not needed: Fajr is computed locally. | Proxy 403 |
| Fajr calculation | Own dependency-free engine (Umm al-Qura, 18.5°). **Worst deviation 0.51 min across 730 days** against the `adhan` reference library. | `npm test`, 4/4 pass |
| Scheduling | Google Calendar connector is live. Primary calendar is already on `Asia/Riyadh`. Claude scheduled tasks exist but fire into chat sessions, which is a weaker trigger than a phone notification. | `list_calendars` |
| Alternative voice | ElevenLabs connector is available. It offers real-time conversational agents with interruptions, phone and web links, and transcripts. It costs credits. | Tool list |
| Pronunciation scoring | Needs raw audio plus a phoneme-level assessment service, such as Azure Pronunciation Assessment. **Not available in Option A.** Optional in Option B (audio exists), with an extra key and cost. | — |

Today's computed schedule: Fajr 05:15 → **session 06:15–06:30** (Asia/Riyadh). Yearly range: about 05:12 in June to about 06:41 in January.

## 3. System architecture (Option A: primary)

```
 Google Calendar ("Executive Coach" calendar)            claude.ai (your account, private)
 ┌───────────────────────────────┐   tap link    ┌──────────────────────────────────────────────┐
 │ Daily event at Fajr+60 (per-  │ ────────────▶ │  Coach Artifact (single page app)             │
 │ day time, generated from      │               │                                               │
 │ src/fajr.js) + notification   │               │  Session Orchestrator (state machine, timer)  │
 └───────────────────────────────┘               │    ├─ Planner      ──▶ sample.json (Claude)   │
                                                  │    ├─ Coach turns  ──▶ sample (Claude)        │
                         you speak ──▶ dictation ─┤    ├─ Grader       ──▶ sample.json (Claude)   │
                         you hear  ◀── tts ───────┤    ├─ Metrics      (deterministic JS)         │
                                                  │    └─ Memory       ──▶ db (private per user)  │
                                                  │  Dashboard: scores, trends, phrases, stage    │
                                                  └──────────────────────────────────────────────┘
```

### 3.1 The coaching engine (highest priority)

The engine is split into four roles, so the supportive coach never grades its own work:

1. **Planner.** Runs once at session start and returns structured output. Inputs: curriculum stage, the three weakest skills, recurring error patterns, phrases due for review, recent topics (to avoid repeats), and the day type (normal, weekly assessment or monthly assessment). Output: the day's warm-up question, fluency challenge, role-play scenario (with a hidden counterpart brief and a hidden "ideal answer" the coach never reveals early), and three target power phrases.
2. **Coach.** Runs once per turn. A persona prompt plus the plan, the current segment and a transcript window. Output: `{say, awaitReply, advanceSegment, arabicGloss?}`. Rules it enforces: one question at a time, never interrupt, play the counterpart in role-play, keep Arabic short and only on request or confusion.
3. **Grader.** Runs twice, at minute 8 for targeted corrections and at the end for the scorecard. It is a separate, strict call that sees the transcript, the deterministic metrics and the rubric, but not the coach persona. Every score must quote evidence from the transcript. It sorts each issue into one of four categories: incorrect, correct-but-unnatural, natural, or executive-level. It returns the three highest-impact corrections only.
4. **Metrics.** Plain JavaScript, no LLM involved. Words per answer, speaking time (from dictation timestamps), approximate words per minute, longest continuous answer, filler-word counts, sentence-length variety and lexical diversity. These anchor the fluency score in measured fact.
   - Caveat: speech-to-text often drops "um" and "uh", so filler counts are a lower bound and are labelled that way.

### 3.2 The 15-minute session (state machine with a soft timer)

| Segment | Time | Mechanics |
|---|---|---|
| Warm-up | 0–2 | One open question. You answer by voice. The coach gives a short natural follow-up. |
| Fluency challenge | 2–5 | Timed 60-second prompt. A visible countdown starts when you start speaking. |
| Role-play | 5–8 | The coach plays the counterpart: CEO, investor, board member and so on. No ideal answer is revealed. |
| Targeted coaching | 8–11 | Grader pass 1 gives three corrections. For each: what you said, then the issue, then a natural version, then an executive version. Then **you repeat it aloud**. |
| Power phrases | 11–13 | Three phrases. Spaced-repetition phrases due for review are mixed in. You must use one aloud in a sentence. |
| Final challenge + score | 13–15 | A 30–60 second challenge. Grader pass 2 produces the scorecard, which is saved to your profile. |

Segments advance on content, not the clock. The timer only nudges ("Let's move to the role-play"). If the session overruns, the coach compresses the remaining segments rather than skipping the scorecard.

### 3.3 Scoring (evidence-based, not inflated)

| Dimension | Points | Source |
|---|---|---|
| Fluency | 20 | Metrics + grader |
| Clarity | 20 | Grader (structure, thought units) |
| Vocabulary | 15 | Grader + lexical metrics |
| Grammar | 15 | Grader (error count per 100 words) |
| Pronunciation & delivery | 15 | **N/A in Option A.** Shown as "unavailable: no audio access". |
| Executive presence | 15 | Grader (concision, authority, diplomacy, structure) |

When pronunciation is N/A, the score is reported as **X / 85, normalised to /100**, and the scorecard shows both numbers. Grader calibration anchors (what 10/20 versus 18/20 fluency looks like, with examples) are part of the grader prompt. This keeps scores stable over time.

### 3.4 Learner memory (db, private path `data/users/<id>/…`)

- **Profile**: stage, sub-scores (moving averages), Arabic-support level (starts at "on request" and fades by stage), and preferences.
- **Sessions**: one record per day with the plan, the full transcript, metrics, the scorecard, three corrections, three phrases and tomorrow's focus.
- **Error patterns**: a recurring-mistake register. Each entry has a pattern, examples, a count, the last date seen and a status (active, improving or resolved). Corrections are matched to existing patterns, so recurrence is visible.
- **Phrases**: spaced repetition using Leitner boxes (intervals of 1, 2, 4, 7, 15 and 30 days). A phrase is mastered once you use it naturally, without being prompted, in three separate sessions. The grader detects this.
- **Curriculum**: the current stage, a mastery-evidence log and a topic history.

### 3.5 Curriculum: 8 stages, gated by mastery, not by calendar

The stages follow your brief:

1. Fluency & Confidence
2. Executive Communication
3. Leadership & People
4. Public Speaking & Storytelling
5. Negotiation & Influence
6. Interviews & Career
7. Business & Investor
8. Advanced Presence

**Advancement gate:** a rolling 5-session average of at least 70/100 on the stage's core dimensions, plus at least 3 stage competencies demonstrated in role-play (the grader confirms each one with evidence).

**Regression rule:** if a dimension drops 10 or more points over 2 weeks, the planner re-injects drills from earlier stages.

The expected timeline is about 180 days, but performance drives it, not the calendar.

**Assessments:**
- Weekly, every Thursday: the full session becomes a structured assessment.
- Monthly, the first session of the month: an executive scenario panel.

About 20% of sessions include an unexpected scenario, to build adaptability.

### 3.6 Scheduling (Fajr + 60, Asia/Riyadh)

- `src/fajr.js` computes each day's Fajr for Makkah (Umm al-Qura) and returns the session start and end with an explicit `+03:00` offset. Saudi Arabia has no DST, so the offset is fixed.
- **Delivery:** a dedicated "Executive Coach" Google Calendar holds one event per day at that day's computed time. Each event carries an "at start" notification and the coach link. Events are generated from the tested engine and written either through the Calendar connector (a rolling 60-day window) or a one-time `.ics` import for the full year. Phase 5 picks one after a test.
- **In-app:** the page shows "Next session: 06:15 (Fajr 05:15)" and opens straight to "Today's session is ready".
- **Honest limit:** nothing can open the app and start talking on its own. Browsers need a tap before the microphone starts. The notification is the trigger, and **one tap starts the session.**

## 4. Key decisions

| # | Decision | Why | Trade-off accepted |
|---|---|---|---|
| D1 | claude.ai Artifact as the product host | Zero infrastructure and cost, private, persistent db, Claude-quality coaching | Laptop/desktop only for voice; turn-based |
| D2 | Separate the Planner, Coach and Grader prompts | Prevents the coach's encouraging tone from inflating scores; improves coherence | About 3 extra LLM calls per session |
| D3 | Deterministic metrics alongside LLM judgement | Fluency claims rest on measured data | Filler counts are a lower bound |
| D4 | Compute Fajr locally, no prayer API | API blocked; offline-reliable; tested to under 1 minute | Calculated times can differ from a mosque's announced time by about 1–2 minutes (irrelevant at +60) |
| D5 | Pronunciation shown as N/A and the score renormalised | No audio access; never invent a score | No accent feedback in Option A |
| D6 | Calendar notification as the daily trigger | Reaches your phone and watch; most reliable habit cue | Needs one tap; voice runs on the computer |
| D7 | Code lives in `exec-coach/` inside the current repo | The only repo this session can write to | It should move to its own repo (needs your OK; see §7) |

## 5. Limitations, stated plainly

- **Turn-based, not full-duplex.** You can't interrupt the coach by voice. A "tap to interrupt" button stops it immediately.
- **Text-only evidence.** Pronunciation, intonation and pace beyond approximate words per minute aren't assessable in Option A.
- **Device.** Voice needs Chrome or Edge on a computer, or the Claude desktop app. On a phone the page works in text mode only.
- **Rate limits.** `sample` calls count against your Claude usage. A session needs about 15–20 calls. If limited, the coach backs off and continues in a lighter mode.
- **Latency.** About 2–5 seconds per coach turn. That's acceptable for coaching, but it isn't a live phone call.

## 6. Options considered

| Option | Voice quality | Mobile | Pronunciation | Cost/month | Infra | Verdict |
|---|---|---|---|---|---|---|
| **A. claude.ai Artifact** | Good, turn-based | Text only | No | $0 extra | None | **Primary** |
| B. ElevenLabs voice agent + Claude grading | Excellent, full-duplex, interruptible | **Yes** | Possible (audio exists, plus an assessment API) | About $40–100 at 450 min/month (credit-based; to verify) | Agent config; memory via post-call grading | **Upgrade path** if mobile or real-time matters |
| C. Self-hosted web app + realtime speech API | Excellent | Yes | Yes | $50–150, plus hosting | Server, keys, security | Rejected for now: high setup and maintenance for one user |

**Gate:** after two weeks of real use of Option A, decide on Option B. The trigger would be that you mostly want to practise on your phone, or that the turn-based rhythm hurts realism.

## 7. Open items needing your input (non-blocking)

1. **Repository.** This session can only write to `Equipment-dashboard`. I've isolated everything under `exec-coach/`. Should I move it into a new dedicated repo later?
2. **Calendar write.** Phase 5 will create a dedicated "Executive Coach" calendar and its events in your Google account. I'll do this when Phase 5 starts unless you object.
