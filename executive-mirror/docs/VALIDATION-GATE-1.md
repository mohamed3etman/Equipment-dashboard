# Validation Gate 1 — Report

**Date:** 12 September 2026
**Question the gate asks:** does Executive Mirror make a senior executive genuinely want to rehearse difficult conversations again?
**Answer:** **not yet knowable — and that is the finding.**

---

## Summary

| | |
|---|---|
| **Verdict** | 🔴 **FIX CORE EXPERIENCE FIRST** |
| **Reason** | The decisive evidence does not exist. No real provider has ever executed. |
| **Blocking** | 2 environment blockers, 1 critical defect (fixed this session) |
| **Validated** | Deterministic discrimination across 7 failure modes × 3 language conditions |
| **Unvalidated** | Every claim that depends on a model or a vendor |

Technical correctness is not the constraint. **Nothing in the conversational or evaluative experience has been observed even once.**

---

## A. Technical Validation

### A.1 Real provider status — **UNVALIDATED — REAL PROVIDER TEST PENDING**

Two independent blockers, both confirmed rather than assumed:

**Blocker 1 — no credentials.** `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` and both voice ids are unset.

**Blocker 2 — network egress policy.** Even with keys, this environment cannot reach two of the three vendors. From the agent proxy's own status endpoint:

```
connect_rejected  api.deepgram.com:443   gateway answered 403 to CONNECT (policy denial)
connect_rejected  api.elevenlabs.io:443  gateway answered 403 to CONNECT (policy denial)
```

**Consequence: real provider validation cannot be performed here at all.** It must run on your machine. This is not a matter of adding keys to this session.

| Check | Status |
|---|---|
| STT | UNVALIDATED |
| LLM | UNVALIDATED |
| TTS | UNVALIDATED |
| WebSocket voice loop (real audio) | UNVALIDATED |
| Arabic | UNVALIDATED |
| English | UNVALIDATED |
| Code switching | UNVALIDATED |
| Latency instrumentation | UNVALIDATED |
| Transcript generation | UNVALIDATED |
| Word timestamps | UNVALIDATED |
| Persona responses | UNVALIDATED |

Eleven of eleven. `npx tsx scripts/validate-providers.ts` reports exactly this and exits non-zero.

### A.2 What the harness will measure when you run it

Built and waiting, `scripts/validate-providers.ts`:

- **STT via round trip** — a known sentence is synthesised with the real TTS as linear16, streamed to the real STT in 20 ms frames, and compared against ground truth. This measures both vendors against a known answer rather than against a vibe.
- **Word timestamps** — asserts non-zero spans. Every Pass 0 metric derives from these; if they are absent the analytics layer is decorative.
- **Pass 0 on real audio** — the probes each contain a spoken number, so quantification must fire on a real transcript, not only on hand-written fixtures.
- **Persona conformance** — sentence cap held, no praise on a weak answer, responded with a question.
- **Audio written to `.validation/`** so voice quality is judged by ear, which is the only way to judge it.

### A.3 What *was* validated technically

| | |
|---|---|
| WebSocket handshake, `ready`, persona-first, audio frames streaming | ✅ mock providers, Arabic |
| Browser mic gate — permission, signal, playback all required | ✅ Chromium, fake device, Arabic RTL |
| Full journey to a running live session | ✅ zero page errors |
| Build, typecheck, 103 tests, config validation | ✅ |

**This proves the plumbing, not the product.**

---

## B. Conversation Quality — **UNVALIDATED**

Not one turn of real conversation has occurred. Persona realism, follow-up quality, pressure realism, interruption quality and contextual continuity are all unobserved.

What has been done is to make them *testable*:

- Persona rewritten to **Skeptical CEO / Hiring Decision Maker** per §3, holding the hiring decision.
- **Listening rules added** — every question after the first must reference something the candidate actually said; claims are trackable across the whole session; never re-ask what was answered. Generic next-questions are the clearest tell that a persona is not listening, and they were previously unconstrained.
- **A real reward for strong answers.** Previously the persona could only escalate. Now, when a claim is properly evidenced, it stops re-litigating and moves up a level to the trade-off behind the decision. Continuing to attack a settled point is now specified as a bug, not as pressure.
- **Explicit anti-theatre constraint** — pressure comes from being unimpressed and specific, never from aggression.

None of this is verified. A persona specification is a hypothesis about behaviour.

---

## C. Executive Evaluation Quality

### C.1 Rubric accuracy — **one critical defect found and fixed**

**Arabic sessions were being evaluated on 6 dimensions where English got 10.**

The Arabic rubric declares seven `shared_with_en` dimensions. They were schema-validated and then silently dropped — nothing ever resolved them. Arabic sessions were never assessed on **ownership, quantification, decision orientation or answer fidelity**.

The config looked complete. All tests passed. The evaluation was hollow.

It was found by printing what actually reached the evaluator, not by a test. Fixed in `resolveRubric()`; Arabic now resolves to 13 dimensions and correctly keeps its calibrated `conclusion_positioning_ar` rather than inheriting the stricter English threshold it exists to avoid. Five tests lock it.

**Every previous statement about Arabic evaluation quality described a crippled rubric.**

Full dimension-by-dimension review, 15 recommendations, in [`RUBRIC-REVIEW-V1.md`](./RUBRIC-REVIEW-V1.md).

### C.2 Failure-mode discrimination — **partially validated**

Seven archetypes × three language conditions, written as realistic answers in your domain rather than keyword caricatures. The over-explaining sample is fluent, hedge-free and well-quantified — it is caught on length alone, which is the point: the corpus tests function, not vocabulary.

| Failure mode | EN | AR | Mixed | Separated by |
|---|:--:|:--:|:--:|---|
| Excessive apology | ✅ | ✅ | — | apology markers, distinct from courtesy register |
| Over-explanation | ✅ | ✅ | — | length + monologue duration |
| **Weak conclusion** | ⚠️ | ⚠️ | — | **nothing — needs Pass 1** |
| No quantified impact | ✅ | ✅ | — | quantification count |
| Technical without business | ✅ | — | ✅ | jargon density vs persona literacy |
| **Defensive under challenge** | ⚠️ | ⚠️ | — | hedge spike visible; **before/after needs Pass 2** |
| Strong executive (control) | ✅ | ✅ | ✅ | clean on every signal |

**Two modes are not separable without the LLM, and this is recorded rather than papered over.** A weak conclusion reads as a clean, compressed answer that simply never states the choice. Defensiveness needs the before/after-challenge comparison only Pass 2 performs. Both are `UNVALIDATED`.

**False-positive guard holds:** the strong *code-switched* answer scores clean on every failure signal while its switching remains visible. Arabic courtesy markers (`سعادتكم`, `تفضلتم`) are never counted as apologies or hedges.

### C.3 Evidence quality — **structurally enforced, behaviourally unvalidated**

The verifier drops any finding that is unevidenced, quotes the persona, cites text never spoken, is missing one of the four required parts, or uses trait language. Proven with planted bad findings in both languages.

What is unknown: whether a real model **selects the right quotes**. A finding can be perfectly evidenced and still cite the wrong three seconds.

### C.4 Coaching usefulness — **gate built, unvalidated**

`src/validation/coaching-quality.ts` rejects "Be more confident", recommendations naming no action, and "why it matters" that never names who is affected. It accepts the brief's worked GOOD example and rejects its BAD example, in both languages.

Whether real output clears the bar is unknown.

### C.5 Executive Mirror & retry — **UNVALIDATED**

Mechanically proven: unevidenced perceptions are dropped; the comparison verdict is decided by deterministic metrics and never by AI bands. Whether the perceptions are *true* and the coaching objective is *the right one* requires a model.

---

## D. Product Risks

### 🔴 Critical

| Risk | Why |
|---|---|
| **The core experience has never been observed.** | Every judgment about whether this is worth using rests on zero conversational evidence. |
| **Arabic was silently half-evaluated.** | Fixed — but it shipped through a full build, 98 tests and two review passes undetected. Assume siblings exist. |
| **The rubric is unproven against a real model.** | It is the product. Untested. |

### 🟠 High

| Risk | Why |
|---|---|
| **Vendor adapters have never executed.** | Deepgram and ElevenLabs are written from documentation. First contact is untested code. |
| **Persona drift toward helpfulness.** | Constrained in config, never observed. If the CEO becomes supportive by turn 8 the product is worthless and the failure is invisible in tests. |
| **`\b` never matches Arabic — occurred three times.** | Now permanently guarded (`regex-safety.test.ts`), but its first version passed while missing a planted defect. Bilingual defects hide well. |
| **Rubric declares priorities the pipeline ignores.** | `weight`, `measured_with`, `emphasis` — schema-validated, consumed by no code. |
| **No `not_assessed` state.** | A dimension the session never tested still gets a confident band. |

### 🟡 Medium

Latency unmeasured against the p50 < 1.5 s target · false-positive risks in `ownership` and `hedging_control` unquantified · nothing persists, so longitudinal claims are untested · `strategic_framing` too generic and likely to produce exactly the coaching §8 forbids.

### 🟢 Low

Only one scenario and persona exist · no Pass 0 DSP metrics · `register_consistency` occupying a slot it does not earn.

---

## E. Recommended Fixes

Only what materially improves the core experience.

**Before anything else — you, one hour**

1. **Obtain the three keys and choose two voices.** Nothing below can be assessed without this. The Arabic voice matters more than the English one: a newsreader voice destroys the pressure the scenario exists to create.
2. **Run `npx tsx scripts/validate-providers.ts` on your machine.** Not here — the egress policy blocks two vendors.

**Then, in order**

3. **Run `npx tsx scripts/validate-evaluation.ts`.** Corpus through the real pipeline: right dimension per failure mode, §8 coaching bar, three retry pairs.
4. **Re-validate Arabic from scratch.** Everything previously believed about it described a 6-dimension rubric.
5. **Apply the three rubric changes that matter** — `closing_strength` (R-5), rewrite `strategic_framing` (R-3), wire or delete the dead config (R-13).
6. **Add `not_assessed`** (R-6/R-14). Stop over-claiming on untested dimensions.
7. **Run the user test protocol.** 25–30 minutes.

**Explicitly not now:** memory, events, documents, CV/JD, presentation coach, boardroom, mobile, billing, multi-user, more scenarios. All correctly deferred.

---

## F. GO / NO-GO

# 🔴 FIX CORE EXPERIENCE FIRST

**Not because the product failed. Because it has not yet been tested.**

The gate asks whether Executive Mirror makes a senior executive want to rehearse again. Answering that requires having *had* a rehearsal. Nobody has. The voice loop has never carried a real word, the rubric has never been applied by a real model, and the Executive Mirror has never produced a real perception.

Reporting GO on mock success would be exactly the substitution §1 forbids.

Three findings sharpen the verdict beyond "we need keys":

1. **A critical Arabic defect survived a full build, 98 tests and two review passes.** It was found by printing what reached the evaluator. Bilingual defects do not announce themselves, and the same review rigour must now be applied to Arabic *behaviour*, not just Arabic config.
2. **Two of seven failure modes cannot be caught deterministically.** Weak conclusions and defensiveness — arguably the two most executive-specific failures in the set — rest entirely on unvalidated LLM judgment.
3. **The rubric review found one criterion likely to produce the generic coaching §8 forbids.** The quality bar and the rubric are currently in tension.

**What would flip this to GO:** provider validation clean, evaluation validation clean, and — decisively — your answer to question 6 of the protocol. If you would not open it unprompted on a Tuesday evening with your DBA defence eleven weeks out, no amount of green tests changes the verdict.

**Estimated distance to a real GO/NO-GO:** roughly one hour of your time (keys, voices, the 30-minute protocol) plus a day of fixes against what the real-provider run surfaces.

---

## Appendix — reproducing this

```bash
npx vitest run                              # 103 tests
npx vitest run src/validation               # discrimination + coaching gate + regex guard
npx tsx scripts/validate-config.ts          # every rubric, scenario, persona, lexicon
npx tsx scripts/validate-providers.ts       # UNVALIDATED here; run on your machine
npx tsx scripts/validate-evaluation.ts      # UNVALIDATED here; needs ANTHROPIC_API_KEY
npx tsx scripts/demo.ts ar                  # full journey, mock providers
```

**Defects found and fixed during this gate**

| Defect | Severity | How found |
|---|---|---|
| Arabic evaluated on 6 dimensions, English on 10 | **Critical** | printing what reached the evaluator |
| Quantification counted digits only — "forty eight hours" scored zero | High | corpus probe |
| Multi-word jargon entries could never match (per-token matching) | Medium | corpus probe |
| Arabic jargon list omitted the English clinical acronyms Saudi healthcare Arabic uses | Medium | corpus probe |
| Third instance of `\b` never matching Arabic | Medium | coaching-gate test |
| `\b` guard's own first version passed while missing a planted defect | Medium | verifying the guard |
| TTS returned mp3 to a linear16 STT endpoint — would have looked like poor accuracy | Medium | review of the round-trip design |
