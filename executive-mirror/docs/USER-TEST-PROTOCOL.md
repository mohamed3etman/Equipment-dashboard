# Executive Mirror — User Test Protocol

**For:** Dr. Mohamed Etman
**Duration:** 25–30 minutes
**Prerequisite:** provider keys configured and `npx tsx scripts/validate-providers.ts` showing no UNVALIDATED rows. **Do not run this protocol before that passes** — you would be evaluating a silent product.

---

## Before you start

```bash
cd executive-mirror
cp .env.example .env.local        # fill in the four keys + two voice ids
npx tsx scripts/validate-providers.ts     # must show 0 UNVALIDATED
npm run dev:live                          # http://localhost:3000
```

**Ground rules that make the result meaningful:**

1. **Answer as you actually would in the room.** Do not perform for the tool. If you deliberately give a good answer to see if it notices, you have tested the evaluator and learned nothing about the product.
2. **Do not read the report between tests 1–4.** Read them at the end, together. Reading feedback mid-protocol changes how you answer the next one.
3. **Write your one-line reaction immediately after each session**, before you see any feedback. Those notes are the data; your considered opinion afterwards is already contaminated by the report.
4. **Use a real answer you actually have.** The document control story, the CBAHI result, the DBA — real material, because the product's whole claim is that it evaluates substance.

Keep this open, or print it.

---

## Test 1 — English executive interview (6 min)

**Setup:** English · Executive Job Interview · Skeptical CEO · 8 minutes

Answer naturally. Let the CEO push back at least twice before you end the session.

**Watch for, and note as it happens:**

| Signal | Your note |
|---|---|
| Did the opening question sound like a real interviewer, or like a prompt? | |
| Did its second question build on what you actually said, or could it have been asked of anyone? | |
| Did it interrupt or redirect at any point? Did that feel earned or random? | |
| Did the latency break the illusion? (Roughly: did you ever wait and notice?) | |
| Did you feel any pressure — the physical kind, not the intellectual kind? | |

**Immediately after, one line:** *Did that feel like a conversation or like dictating to software?*

---

## Test 2 — Arabic executive interview (6 min)

**Setup:** العربية · same scenario · same persona · 8 minutes

⚠️ **Arabic evaluation is versioned `developing` and was, until this week, running on a crippled rubric** (see `RUBRIC-REVIEW-V1.md` R-1). Judge it harder than the English one, and assume findings are wrong until they prove otherwise.

**Watch for:**

| Signal | Your note |
|---|---|
| Is the Arabic *executive register*, or is it translated English? | |
| Does the CEO sound Gulf-professional, or MSA-newsreader? | |
| Does the TTS voice carry authority, or does it sound like an announcement? | |
| Did it mishear any Arabic word in a way that changed your meaning? | |
| Did courtesy on your part get treated as weakness at any point? | |

**Immediately after:** *Would you be comfortable if a Saudi CEO heard this persona and knew you built it?*

---

## Test 3 — Code-switched conversation (4 min)

**Setup:** العربية · same scenario · 4 minutes

Speak the way you actually speak in a Riyadh executive meeting — Arabic structure with English terms of art wherever that is natural. Do not force switches; do not suppress them either.

**Watch for:**

| Signal | Your note |
|---|---|
| Did the transcript preserve both languages, or did it flatten one? | |
| Did the persona comment on your switching? (It must not.) | |
| Did the persona switch language itself? (It must not.) | |
| Were English terms transcribed correctly inside Arabic speech? | |

**This is the test most likely to break.** Note exactly what broke, not just that something did.

---

## Test 4 — Pressure challenge (5 min)

**Setup:** English · 4 minutes

Deliberately give a **weak first answer**: describe a project's *process* for about a minute without naming a decision or a number. Then let the CEO come after you, and defend it.

**Watch for:**

| Signal | Your note |
|---|---|
| Did it notice the answer was process rather than decision? | |
| Was the follow-up specific, or a generic "tell me more"? | |
| Did it escalate — did the third question have more edge than the first? | |
| Did it ever soften, praise, or start helping you? (Persona drift — a bug.) | |
| Did the pressure stay professional, or tip into theatre? | |

**Immediately after:** *Was that recognisable as an interviewer you have actually faced?*

---

## Test 5 — The retry loop (5 min) — **the most important test**

Now open the report from **Test 4**.

1. Read the single **"one thing to change"** and nothing else yet.
2. **Before retrying, predict:** will your second attempt actually be better? Write yes/no.
3. Hit **Try again with this focus.** Answer the same question.
4. Open **Compare.**

**Watch for:**

| Signal | Your note |
|---|---|
| Was the coaching objective specific enough to act on in ten seconds? | |
| Did you actually change your behaviour, or just say it differently? | |
| Did the comparison verdict match your own sense of whether you improved? | |
| Did it claim improvement you do not believe? (Trust-killer — record verbatim.) | |
| Did it miss improvement you know happened? | |

**If the verdict disagreed with your own judgment, that single fact outweighs everything else in this protocol.**

---

## Now read all the reports

Take ten minutes. Read Tests 1, 2 and 4 properly, including the evidence quotes.

**Check three specific things:**

1. **Click three evidence quotes.** Do they say what the finding claims they say? A finding whose quote does not support it is worse than no finding.
2. **Find one finding you disagree with.** Is it wrong, or is it right and unwelcome? Those are very different, and only you can tell them apart.
3. **Open "findings rejected before you saw them."** Were the right ones rejected? If something useful was thrown away, the verifier is too strict.

---

## Final assessment

Answer in your own words. Short is fine; specific is essential.

**1. Did the persona feel real?**
> Not "was it good" — would you have recognised it as a person if you had not known?

**2. Did the pressure feel realistic?**
> Compared to an actual first-round executive interview: too soft, about right, or theatrical?

**3. Did the feedback feel accurate?**
> Name one finding that was right and one that was wrong.

**4. Did the feedback teach you something?**
> Something you did not already know about how you come across. If nothing, say nothing — that is the most useful answer you can give.

**5. Did the retry actually improve the answer?**
> Your judgment, not the system's verdict.

**6. Would you voluntarily use this again?**
> The only question that decides the gate. Answer it as a diary commitment, not an opinion: *would you open this on a Tuesday evening with your DBA defence eleven weeks out?*

**7. What felt artificial?**
> Be specific. "The pauses" is actionable; "it felt like AI" is not.

**8. What felt surprisingly useful?**
> Whatever you name here is what the product should be built around.

---

## Two things that decide GO / NO-GO

Everything above informs the decision. These two make it:

> **A. Would you come back on your own?**
> Not "is it impressive." Would you open it unprompted, with a real event approaching?

> **B. Did it tell you one true thing about yourself that you did not already know?**
> That is the entire value proposition in one sentence. If the answer is no after five sessions, the rubric is not yet good enough — and the fix is rubric content, not engineering.

---

## Recording your answers

```bash
cp docs/USER-TEST-PROTOCOL.md .validation/user-test-$(date +%F).md
# fill in the tables and the eight questions directly in the copy
```

Send that file back and I will turn it into the fix list. Raw notes are more useful than a tidied summary — including the parts where you were annoyed.
