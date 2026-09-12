# Rubric Review V1

**Scope:** `config/rubrics/en/executive.v1.yaml`, `config/rubrics/ar/executive.v1.yaml`, `config/rubrics/shared/evidence-rules.v1.yaml`
**Method:** structural review + the failure-mode corpus in `src/validation/failure-modes.ts`
**Status of recommendations:** NOT APPLIED. Section 9 of the gate says do not rewrite the rubric automatically. One resolution *bug* was fixed (R-1); every content change below awaits your decision.

---

## 0. The finding that matters most

**R-1 — Arabic was being evaluated on 6 dimensions where English got 10. FIXED.**

The Arabic rubric declares `shared_with_en: [answer_fidelity, evidence_and_quantification, ownership, compression, strategic_framing, decision_orientation, technical_detail_control]` — the seven dimensions whose executive substance does not change with language.

Those ids were validated by the schema and then silently dropped. `buildContentPass` and friends read `cfg.rubric.dimensions` only, and nothing ever resolved the shared list. An Arabic session was therefore never assessed on **ownership, quantification, decision orientation or answer fidelity** — four of the most important things the product claims to measure.

The config looked complete. The tests passed. The evaluation was hollow.

This is precisely the failure mode the gate exists to catch, and it is worth noting *how* it was found: not by a test, but by printing what actually reached the evaluator. Fixed in `resolveRubric()` with five tests, including one asserting that Arabic keeps its own calibrated `conclusion_positioning_ar` rather than inheriting the stricter English threshold it exists to avoid. Arabic now resolves to 13 dimensions.

**Implication for the gate:** every claim previously made about Arabic evaluation quality was measuring a crippled rubric. Arabic must be re-validated from scratch once providers are live.

---

## 1. English rubric — dimension-by-dimension

| # | Dimension | Verdict | Notes |
|---|---|---|---|
| 1 | `answer_fidelity` | **Strong** | Concrete probe ("restate the question, then say whether it was answered"). Hardest thing to fake. Keep unchanged. |
| 2 | `conclusion_positioning` | **Strong** | The only dimension bound to a deterministic metric AND a rubric judgment. Best-designed in the set. |
| 3 | `evidence_and_quantification` | **Strong** | Measurable, unambiguous, high executive value. |
| 4 | `ownership` | **Good, with a real false-positive risk** | See R-2. |
| 5 | `compression` | **Good** | Measurable. Overlaps #10 — see R-4. |
| 6 | `strategic_framing` | **WEAK — the weakest in the rubric** | See R-3. |
| 7 | `decision_orientation` | **Good** | Clear test. But it measures *having* a position, not *landing* it — see R-5. |
| 8 | `pressure_integrity` | **Strong concept, unsafe implementation** | See R-6. |
| 9 | `hedging_control` | **Good, highest false-positive risk in the rubric** | See R-7. |
| 10 | `technical_detail_control` | **Strongest design in either rubric** | Judged against the persona's *declared literacy* rather than an absolute jargon threshold. This is the pattern the other dimensions should copy. |

### R-2 — `ownership` will punish correct behaviour (Medium)

Current: *"Uniform 'we' that makes personal contribution unrecoverable."*

A leader describing a genuine team achievement as "we" is being accurate, not evasive. As written, the dimension cannot tell the difference between deflection and correct credit-sharing — and an executive coached out of saying "we" becomes someone nobody wants to work for.

**Recommend:** make the test conditional on the question. Flag only when the interviewer explicitly asked for *personal* contribution and the answer stayed collective. Add to `weakened_by`:
> Only flag collective language when the question specifically asked what the speaker personally decided or owned. Crediting a team for team work is correct and must never be a finding.

### R-3 — `strategic_framing` is too generic to act on (High)

Current: *"connects activity to enterprise consequence — risk, cost, capability, reputation, patient outcome, regulatory position."*

That is a category, not a test. Two evaluators would disagree, and it overlaps `decision_orientation` (#7) and `technical_detail_control` (#10). Generic criteria produce generic coaching, which §8 exists to forbid — so the rubric is currently working against its own quality bar.

**Recommend:** replace with a concrete, falsifiable probe:
> Identify the highest organisational level at which this answer states a consequence: task, team, department, function, enterprise. Quote the phrase that establishes it. If no phrase establishes any level above 'department', the answer is departmentally framed regardless of the vocabulary used.

That is checkable, quotable, and produces a specific correction.

### R-4 — `compression` and `technical_detail_control` double-penalise (Low)

Both fire on an over-detailed answer, so one behaviour produces two findings and the report looks repetitive. In the corpus, `over_explanation` triggers both.

**Recommend:** scope them explicitly — `compression` owns *length*, `technical_detail_control` owns *depth relative to audience*. Add a mutual-exclusion note: when both would fire, report the one the audience would name.

### R-5 — MISSING: how the answer ends (High)

The `weak_conclusion` corpus sample exposed this. That answer is concise, well-structured, jargon-free and hedge-free — and it never says which option was chosen. It trails off into "those were the considerations."

No dimension covers this. `decision_orientation` asks whether a position exists; nothing asks whether the answer *lands*. §5's ANSWER framework has `E — End with recommendation` and `R — Reinforce the outcome`, but the framework is applied advisorily and is not a scored dimension.

**Recommend a new dimension, `closing_strength`:**
> Strong: the final sentence states the outcome, the recommendation, or the thing the listener should remember.
> Weakened by: ending on caveats; ending on the process; ending on a list of considerations; trailing off; letting the interviewer decide when the answer stops.

This is the single most valuable addition available, because it is common, invisible to the speaker, and highly consequential in a board setting.

### R-6 — `pressure_integrity` can emit a band with nothing to judge (High)

It is marked `segmented: true` — evaluated before vs after the first challenge. But if the persona never challenged (short session, strong answers, drifted persona), there is no "after". The rubric gives the evaluator no instruction for that case, and the pipeline has no *not assessable* state, so a band gets emitted anyway.

A confident "Developing" on a dimension that was never tested is worse than silence.

**Recommend two changes:**
1. Add to the rubric: *"If the transcript contains no challenge turn, return `not_assessed` and no band."*
2. Add `not_assessed` to the band enum in `evidence-rules.v1.yaml`, and render it as an explicit "not tested this session" row rather than hiding it. Applies to any `segmented` dimension.

### R-7 — `hedging_control` will over-fire (Medium)

The note already says *"Professional caution is not hedging"* — but a note is advisory and the model will not weigh it against ten concrete `weakened_by` bullets.

Real executives qualify things that genuinely warrant qualification. Coaching that out produces overconfidence, which is a worse failure than hedging.

**Recommend:** promote the caveat from a note to a hard gate in `weakened_by`:
> Do not flag a qualifier attached to a genuinely uncertain claim (a forecast, another party's decision, an unmeasured effect). Flag only where the speaker qualifies something they are positioned to state plainly.

---

## 2. Arabic rubric — dimension-by-dimension

The Arabic rubric remains independently designed. Nothing below imports an English criterion.

| # | Dimension | Verdict | Notes |
|---|---|---|---|
| 1 | `conclusion_positioning_ar` | **Strong** | Correctly more permissive than English, with the reasoning recorded in `calibration_note`. |
| 2 | `courtesy_vs_hedging` | **Strongest dimension in either rubric** | Functional rather than lexical, explicit `never_penalise` list, four named firing conditions. This is the design the whole product should be judged against. |
| 3 | `hierarchy_awareness` | **Right idea, hardest to judge** | See R-8. |
| 4 | `register_consistency` | **Correct but low value** | See R-9. |
| 5 | `code_switching` | **Correctly stanced, wrongly placed** | See R-10. |
| 6 | `pressure_integrity_ar` | **Strong** | The four `arabic_specific_signals` — courtesy escalation, formula retreat, register flight, over-concession — are genuinely good and have no English equivalent. Keep. |

### R-8 — `hierarchy_awareness` needs an observable anchor (Medium)

*"Self-diminishment that undercuts credibility"* is the right target and nearly unjudgeable as written. It risks either firing constantly on normal GCC deference, or never firing at all.

**Recommend:** anchor it to the same functional test that makes `courtesy_vs_hedging` work — a *change* in register rather than its level:
> Compare the deference level in the opening answer with the deference level after the first challenge. Flag only an increase. A consistently respectful register, however formal, is never a finding.

Register level is cultural. Register *change under pressure* is a signal. Only the second is measurable.

### R-9 — `register_consistency` should be demoted (Low)

MSA/Gulf/Egyptian drift is real, but it is rarely what loses a boardroom, and it competes for attention with dimensions that are. It is currently `weight: medium`, the same as `hedging_control`.

**Recommend:** demote to `low`, or move it out of the scored set into an observation the report mentions without banding.

### R-10 — `code_switching` is a guard, not a dimension (Medium)

Its `flag_only_when.reduces_clarity` requires **three** conditions simultaneously (a precise Arabic term exists AND the audience prefers Arabic AND clarity is reduced). That conjunction is so strict it will essentially never fire — which is the *correct behaviour*, but then it should not occupy a dimension slot and invite a band.

**Recommend:** move it from `dimensions` to a new `guards` section — rules the evaluator must respect but never scores. Its real job is to stop *other* dimensions from penalising code-switching, and the corpus confirms it currently does that job (the strong code-switched control passes cleanly).

### R-11 — `ownership` should NOT be shared with English (High)

Now that R-1 makes sharing actually work, this matters. Arabic marks agency differently: heavy `أنا` can read as immodest in some GCC settings where an English speaker is expected to say "I decided" plainly. Applying the English ownership criterion to Arabic risks coaching a Saudi executive toward a register that would cost them credibility in the room.

**Recommend:** remove `ownership` from `shared_with_en` and author an Arabic `ownership_ar` that distinguishes deflection from culturally appropriate collective framing — the same functional split that makes `courtesy_vs_hedging` work.

### R-12 — MISSING: indirect refusal (Medium)

Arabic professional discourse often declines indirectly. An executive who cannot say "no" clearly to a board is materially weakened, but the Arabic form of that failure is not a missing recommendation — it is a recommendation phrased so softly that the listener cannot tell a decision was made. `decision_orientation`, written for English, does not capture it.

**Recommend a new Arabic dimension** covering whether a refusal or negative recommendation was stated clearly enough to be acted on.

---

## 3. Cross-cutting findings

### R-13 — `weight`, `measured_with` and `emphasis` are dead config (High)

All three are schema-validated and consumed by **no code**:

```
weight:        declared on all 16 dimensions — never read
measured_with: declared on 5 dimensions      — never read
emphasis:      declared on the scenario      — never read
```

The rubric states priorities the pipeline ignores. Worse, it is *believable* config — a future reader will reasonably assume `weight: critical` does something.

**Recommend, in order of value:**
1. **`emphasis` and `weight`** → pass into the prompt so the evaluator knows which dimensions this scenario cares about most. Cheap, and directly improves relevance.
2. **`measured_with`** → validate at config-load that each named metric key exists in Pass 0 output. This is how a renamed metric silently detaches a dimension from its evidence.
3. If any is not going to be used, **delete it**. Dead config is worse than absent config.

### R-14 — No `not_assessed` band (High)

Covered in R-6, but it is structural rather than per-dimension. Five bands all assert a judgment. There is no way to say "the session did not test this." Until there is, every report over-claims.

### R-15 — The Arabic rubric's `developing` status is invisible where it matters (Medium)

`status: developing` appears in the report's Provenance block, at the very bottom, in 11px monospace. A user reading Arabic findings has no signal that Arabic evaluation is less mature than English.

**Recommend:** surface it at the top of an Arabic report — one line, plain: *"Arabic evaluation is still being calibrated. Tell me where it is wrong."* This also creates the feedback channel the rubric needs to actually improve.

---

## 4. Recommendation summary

| Ref | Change | Priority | Effort | Applied? |
|---|---|---|---|---|
| R-1 | Resolve `shared_with_en` | **Critical** | done | ✅ FIXED |
| R-5 | Add `closing_strength` dimension | **High** | S | ⬜ your call |
| R-6 / R-14 | Add `not_assessed` for untested dimensions | **High** | M | ⬜ |
| R-3 | Rewrite `strategic_framing` as a levels probe | **High** | S | ⬜ |
| R-11 | Un-share `ownership`; author `ownership_ar` | **High** | M | ⬜ |
| R-13 | Wire or delete `weight` / `measured_with` / `emphasis` | **High** | S | ⬜ |
| R-2 | Make `ownership` conditional on the question | Medium | S | ⬜ |
| R-7 | Harden the `hedging_control` caveat | Medium | S | ⬜ |
| R-8 | Anchor `hierarchy_awareness` to register *change* | Medium | S | ⬜ |
| R-10 | Move `code_switching` to a `guards` section | Medium | S | ⬜ |
| R-12 | Add Arabic indirect-refusal dimension | Medium | M | ⬜ |
| R-15 | Surface Arabic `developing` status prominently | Medium | S | ⬜ |
| R-4 | Scope `compression` vs `technical_detail_control` | Low | S | ⬜ |
| R-9 | Demote `register_consistency` | Low | S | ⬜ |

**If you change only three things: R-5, R-3 and R-13.** R-5 closes a real hole the corpus proved exists, R-3 removes the one criterion most likely to generate the generic coaching §8 forbids, and R-13 stops the rubric lying about what it controls.

---

## 5. What this review could not assess

Everything about how the rubric behaves **in the hands of a real model**:

- whether the criteria actually discriminate when an LLM applies them
- whether false-positive risks (R-2, R-7, R-8) materialise in practice or stay theoretical
- whether Arabic findings read as natural professional Arabic or as translated English
- whether the evidence quotes the model selects are the *right* quotes

All of that is `UNVALIDATED — REAL PROVIDER TEST PENDING`. The corpus and harness are built and waiting; only credentials are missing.
