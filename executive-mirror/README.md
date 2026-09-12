# Executive Mirror

Private bilingual AI executive communication and high-stakes conversation coach.

> "If I were sitting across the table from you, this is how I would perceive you."

This is the **first vertical slice** (Master Build Prompt V2 §40): one scenario,
one persona, Arabic + English, the full analysis pipeline, the retry loop, and
the comparison that says whether attempt 2 was actually better.

---

## Quick start

```bash
npm install
npm run config:validate     # every rubric, scenario, persona, lexicon
npm test                    # 62 tests
npm run dev                 # http://localhost:3000
```

**No API keys are required to run it.** With none set, mock providers serve the
whole journey — transcript, metrics, evidence-checked evaluation, retry,
comparison — so the loop is walkable and testable. The voice is silent and the
evaluation is scripted until you add keys to `.env.local` (see `.env.example`).

```bash
npx tsx scripts/demo.ts en   # end-to-end journey in the terminal
npx tsx scripts/demo.ts ar
```

---

## The one rule that shapes everything

**The voice stack is plumbing. The evaluation rubric is the product.** (V2 §47)

Streaming STT → LLM → TTS is a commodity. What is hard to copy is a rubric that
knows what a Saudi board chair actually punishes, plus a memory of how *this*
executive behaves under pressure. So the voice layer is deliberately boring and
swappable, and the rubric lives in versioned config that can be improved without
touching application code.

---

## Architecture decisions

### 1. All TypeScript, no Python worker

The Phase 0 analysis recommended a Python worker for LiveKit Agents and audio
DSP. The three slice metrics — WPM, pauses, fillers — are arithmetic over word
timestamps, not DSP. Python buys nothing until Phase 2 pitch/loudness analysis,
and a second runtime is real friction at N=1 (V2 §45.1). When pitch analysis
lands, it becomes a Python sidecar behind an interface.

### 2. WebSocket + Web Audio, not WebRTC/LiveKit

For one user at a desk, WebRTC's advantages (NAT traversal, adaptive bitrate)
don't apply, and LiveKit would abstract away exactly the per-stage latency
instrumentation V2 §37/§38 require. Deepgram's `utterance_end_ms` handles turn
detection. Revisit if mobile-over-cellular becomes a real use case.

### 3. Cascaded STT → LLM → TTS, not speech-to-speech

Speech-to-speech is ~600ms faster and sounds better. It is still the wrong
choice here: **for a coaching product the transcript *is* the product.** Every
metric, every evidence quote, every timestamp jump derives from word-level
timings that speech-to-speech models do not reliably expose. (V2 §11)

### 4. Two-tier metrics, separated in the schema

`objective` (arithmetic over timings — same recording, same number) and
`semi_objective` (deterministic, but the *rule* embeds a judgment) are different
rows with a `tier` column, so the UI separation V2 §12 demands is structural
rather than a convention someone forgets.

### 5. Evidence enforced in code, not in the prompt

`src/analysis/evidence.ts` drops any finding that is unevidenced, quotes a
persona turn, cites text the user never said, is missing one of the four
required parts, or uses trait language. Prompts asking a model to cite evidence
are obeyed *most* of the time; that is not good enough for a claim about how
someone came across. The report shows the rejection count and reasons.

### 6. Bands, never scores; AI bands never carry the verdict

Five bands (V2 §15). No composite, no decimals, no 0–100. The retry verdict is
decided by deterministic metrics; band movement is reported alongside with an
explicit note that it can shift because the rubric or model changed rather than
because the speaker did.

### 7. Arabic is a separate rubric, not a translation

`config/rubrics/ar/executive.v1.yaml` exists because Arabic executive
communication differs in ways an imported rubric gets wrong:

- Courtesy and deference formulas are professional competence in GCC settings.
  They are flagged only by **function** — when they delay the answer, replace a
  requested claim, or increase after a challenge — never by lexeme.
- Conclusion-first is **calibrated**, not imported: a short contextual opening
  is legitimate. The failure is context that never arrives at a claim.
- English business terms inside Arabic speech are normal register and are never
  a finding on their own.
- Register (MSA / Gulf / Egyptian) is judged for consistency and audience fit,
  never for conformity to MSA.

Versioned `status: developing` — to be improved against validated examples.

---

## Layout

```
config/                      # versioned, editable without a deploy (V2 §33)
  rubrics/en|ar/             # executive rubrics — Arabic is NOT a translation
  rubrics/shared/            # evidence rules + the five bands
  scenarios/                 # situation, audience, challenge bank, targets
  personas/                  # behaviour specs, not biographies
  lexicons/                  # fillers, hedges, courtesy markers, quantifiers
  labels.v1.yaml             # bilingual display labels

src/
  config/       loader + zod validation (fails loudly)
  analysis/
    normalize   Arabic-aware normalisation (match-only; display keeps originals)
    metrics     Pass 0 — deterministic, no LLM
    prompts     builds every prompt from config
    schemas     JSON schemas for structured output
    evidence    the verifier — where §14 is actually enforced
    pipeline    Pass 1-3 parallel, Pass 4 synthesis
    compare     retry comparison
  providers/    STT / LLM / TTS interfaces + Deepgram, Anthropic, ElevenLabs, mocks
  session/      live orchestrator — barge-in, early TTS, latency instrumentation
  db/           Drizzle schema
  components/   UI
  app/          Next.js routes
```

---

## What works now

- Bilingual config with cross-reference validation
- Pass 0 deterministic metrics, both languages, tiered
- Passes 1–4 with structured output and enforced evidence
- Retry comparison with an honest verdict
- Live orchestrator: barge-in, sentence-boundary TTS, per-stage latency
- Real microphone check (hard gate — no skip link)
- Report UI: light/dark, LTR/RTL, mobile-clean
- 62 tests

## What is stubbed or not built

- **Audio path is not wired end-to-end.** The orchestrator, providers and mic
  check exist and are tested; the browser↔server WebSocket bridge is not yet
  written, so a live voice session does not yet run.
- **Nothing is persisted.** The Drizzle schema is written; no migrations, no
  writes. The report renders from a scripted run.
- Communication memory, baseline mode, events, progress: schema only.
- Deepgram / ElevenLabs adapters are written against their documented APIs but
  have not been executed — no keys in this environment.

## Deliberately excluded

Video and gaze analysis, composite "executive score", vocabulary diversity as a
headline metric, benchmarking against other executives (no corpus exists —
publishing one would be fabrication), multi-persona boardroom, vector RAG,
billing, SSO. (V2 §42)
