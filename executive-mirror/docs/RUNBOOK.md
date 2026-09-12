# Running Executive Mirror on your machine

Everything below happens on **your** laptop. None of it can run in the cloud session — that environment has no credentials and its network policy blocks Deepgram and ElevenLabs outright.

Total time: about 25 minutes, most of it waiting for `npm install` and picking a voice.

---

## 1. Get the code

```bash
git clone https://github.com/mohamed3etman/Equipment-dashboard.git
cd Equipment-dashboard
git checkout claude/executive-coaching-analysis-qy5tnh
cd executive-mirror
npm install
```

Requires Node 20 or newer (`node --version`).

Sanity check before spending anything:

```bash
npm test                          # 103 tests
npx tsx scripts/validate-config.ts   # every rubric, scenario, persona, lexicon
```

---

## 2. Get three keys and pick two voices

| Service | Where | Notes |
|---|---|---|
| **Deepgram** | console.deepgram.com | Free credit is plenty for a few sessions |
| **Anthropic** | console.anthropic.com | Used for both the CEO persona and the analysis |
| **ElevenLabs** | elevenlabs.io | **See the tier note below** |

### The ElevenLabs tier note — read this before you pay

Every credible Arabic executive voice is a **professional library voice**, and those require at least the **Creator** tier. I confirmed this against your connected workspace: two Saudi voices were both refused with *"You need to be on the creator tier or above."*

A free-tier default voice will sound like a narrator, and Test 2 of the protocol will fail for reasons that have nothing to do with the product. Budget for Creator, or accept that the Arabic sessions are not a fair test.

Shortlist (Saudi, male, middle-aged) — audition all three in the ElevenLabs UI:

| Voice | id |
|---|---|
| Nasser — Enterprise, Professional | `3GnbqfjaW8xI6hRTVx4Y` |
| Faisal alotaibi — Warm Saudi | `wyC6KvCMTAXGbiCKlfSx` |
| Eid — Warm, Clear, Confident | `Ywuz3KyW2N5pqKNpwcCL` |

Judge them on exactly one question: **does it sound like a person in a room, or like a recording?** Voices marketed for documentaries and IVR fail that test even when they sound good.

### Write the file

```bash
cp .env.example .env.local
```

Then fill in:

```bash
DEEPGRAM_API_KEY=...
ANTHROPIC_API_KEY=...
ELEVENLABS_API_KEY=...
EM_TTS_VOICE_EN=...        # an English voice id
EM_TTS_VOICE_AR=...        # your chosen Arabic voice id
```

`.env.local` is gitignored. Do not commit it.

---

## 3. Validate the real providers

```bash
npx tsx scripts/validate-providers.ts
```

This synthesises a known sentence with your real TTS, streams it to your real STT, and compares the result against the original — so it tests both vendors against a known answer rather than a vibe.

**Read the exit code:**

| Code | Meaning |
|---|---|
| `0` | Everything ran and passed |
| `1` | Something ran and failed — read the FAIL rows |
| `2` | Nothing could run — a key is missing |

Then **listen to the audio it wrote**:

```bash
open .validation/tts-ar.mp3       # macOS
```

If that does not sound like a CEO who is unimpressed with you, change the voice before going further. No amount of good coaching survives a narrator's voice.

The row that matters most is `word timestamps`. Every speech metric derives from those; if they are missing, the analytics are decorative and you should stop and tell me.

---

## 4. Validate the evaluation

```bash
npx tsx scripts/validate-evaluation.ts
```

Runs seven realistic failure modes through the real analysis pipeline and checks three things: the right rubric dimension fires for each failure, every finding clears the "no generic coaching" bar, and the retry loop detects real improvement.

This costs a few dollars of Anthropic usage. It is worth it — it is the only check that tests the rubric rather than the plumbing.

Send me the output if anything fails. Do not fix it yourself; the failures are informative.

---

## 5. Start it

```bash
npm run dev:live
```

Open **http://localhost:3000**

⚠️ **`npm run dev:live`, not `npm run dev`.** Plain `next dev` serves the pages but not the voice socket, so a session cannot connect.

⚠️ **If you ran `npm run build` at any point, delete `.next` first** — the dev and production builds share that directory and clobber each other:

```bash
rm -rf .next && npm run dev:live
```

---

## 6. Your first session

1. **Dashboard** → *Start a session*
2. **Language** → English for the first one
3. **Length** → 8 minutes
4. **Check microphone** → *Test microphone*, speak for three seconds, then *Play back*.
   The Start button stays disabled until all three lights are green. That gate is deliberate: the worst possible outcome is a ten-minute rehearsal that recorded silence.
5. **Start session.** The CEO speaks first — no countdown. Answer as you actually would.
6. The screen shows only a timer. That is intentional: a live transcript or filler counter would pull attention off the conversation and induce the hesitation it measures.
7. **You can interrupt it.** Talking over the CEO cuts it off, as it would in a real room.
8. **End session** → analysis runs → *Open your report*.

### On the report

- The top block is the **one thing to change**. Everything else is below it.
- Every AI judgment carries a **quote with a timestamp**. Click them. If a quote does not support the finding, that is a bug worth telling me about.
- At the bottom, **"findings rejected before you saw them"** shows what the verifier threw out. Worth one look on your first session.

### The retry — this is the part that matters

Hit **Try again with this focus**. It re-runs the *same* opening question with your correction injected, then attaches the result to the original report and shows **Compare**.

Do that at least twice across your five sessions. The comparison verdict is decided by measured metrics, not AI opinion — so if it says you improved and you disagree, that disagreement is the single most valuable piece of feedback you can give me.

---

## 7. What to expect to be rough

Stated plainly so you can tell a bug from a limitation:

- **Sessions live in memory.** Restarting `dev:live` loses them. Fine for a run of sessions in one sitting; tell me if you want them to survive a restart.
- **Arabic evaluation is versioned `developing`,** and until this week it was running on a rubric missing seven of its thirteen dimensions. Judge Arabic findings harder than English ones.
- **The Deepgram and ElevenLabs adapters have never executed.** They are written from documentation. Step 3 is their first contact with reality — expect that step, not the sessions, to be where things break.
- **One scenario, one persona.** By design for now.
- Latency has never been measured against the 1.5s target. The live screen prints the reply latency after each turn; glance at it.

---

## 8. After five sessions

Fill in `docs/USER-TEST-PROTOCOL.md` — five tests, 25–30 minutes, with the eight questions at the end.

The two answers that decide what happens next:

> **Would you open this unprompted on a Tuesday evening, with your DBA defence eleven weeks out?**
>
> **Did it tell you one true thing about how you come across that you did not already know?**

Send the raw notes, including the parts where it annoyed you. Those are more useful than a tidy summary.

---

## If something breaks

| Symptom | Cause |
|---|---|
| Session screen says "could not start" | Running `npm run dev` instead of `dev:live` |
| 404s on `/_next/static/...` | Stale `.next` — `rm -rf .next` and restart |
| Mic check never detects sound | Browser mic permission, or the page is not on `localhost`/HTTPS |
| CEO is silent but the timer runs | `ELEVENLABS_API_KEY` or `EM_TTS_VOICE_*` missing — step 3 would have caught it |
| Report is empty | `ANTHROPIC_API_KEY` missing; check the `dev:live` terminal |
| CEO praises you or gets chatty | Persona drift — a real bug. Send me the transcript. |

Send me the terminal output rather than describing it.
