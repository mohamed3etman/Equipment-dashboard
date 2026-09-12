/**
 * End-to-end journey exercise. Runs the full pipeline with mock providers so
 * the whole loop is verifiable without vendor keys:
 *
 *   session -> transcript -> Pass 0 -> Passes 1-4 -> evidence enforcement
 *           -> report -> retry -> comparison
 *
 * Usage:  npx tsx scripts/demo.ts [en|ar]
 */
import { loadSessionConfig } from '../src/config/loader';
import { analyseSession } from '../src/analysis/pipeline';
import { compareAttempts } from '../src/analysis/compare';
import { MockLlmProvider, synthesiseWords } from '../src/providers/mock';
import { buildPersonaSystemPrompt } from '../src/analysis/prompts';
import type { Lang, Transcript, Turn } from '../src/lib/types';

const lang = (process.argv[2] === 'ar' ? 'ar' : 'en') as Lang;
const cfg = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', lang);

// ---------------------------------------------------------------- fixtures

const EXCHANGES: Record<Lang, { attempt1: Array<[string, string]>; attempt2: Array<[string, string]> }> = {
  en: {
    attempt1: [
      ['persona', 'Walk me through what you personally decided that the organisation would not have decided without you.'],
      ['user', 'Well thank you for the question. So basically I think the context is important here. We had a document control system that was entirely paper based, and the process involved multiple departments, and we mapped the workflow, and then we ran a series of improvement cycles, and eventually we probably managed to move it to an electronic system.'],
      ['persona', 'I asked what you decided, not how you did it.'],
      ['user', 'Right, sorry. I mean, we as a team decided to prioritise it, and I think it was maybe the right call.'],
    ],
    attempt2: [
      ['persona', 'Walk me through what you personally decided that the organisation would not have decided without you.'],
      ['user', 'I decided to move document control off paper entirely, against the operations view that it was a low priority. I owned that call. Report turnaround went from 48 hours to 2 hours in one quarter.'],
      ['persona', 'Why should I believe that number?'],
      ['user', 'It came from the reporting system timestamps, not a survey. I can show you the baseline.'],
    ],
  },
  ar: {
    attempt1: [
      ['persona', 'ما القرار الذي اتخذته أنت شخصياً وما كانت المؤسسة لتتخذه بدونك؟'],
      ['user', 'شكراً على السؤال. يعني الموضوع فيه تفاصيل كثيرة. كان عندنا نظام ضبط وثائق ورقي بالكامل، والعملية كانت تمر على عدة إدارات، وقمنا بدراسة سير العمل، وبعدها نفذنا دورات تحسين، ثم ممكن نقول أننا حولناه الى نظام الكتروني.'],
      ['persona', 'أنت وصفت إجراءً. أنا سألت عن نتيجة.'],
      ['user', 'أعتقد أن النتيجة كانت جيدة، والله أعلم، احنا كفريق قررنا نعطيه أولوية.'],
    ],
    attempt2: [
      ['persona', 'ما القرار الذي اتخذته أنت شخصياً وما كانت المؤسسة لتتخذه بدونك؟'],
      ['user', 'أنا قررت نقل ضبط الوثائق من الورق بالكامل، رغم أن العمليات كانت ترى أنها أولوية متأخرة. تحملت هذا القرار. زمن إصدار التقرير انخفض من ٤٨ ساعة الى ساعتين خلال ربع واحد.'],
      ['persona', 'لماذا يجب أن أصدق هذا الرقم؟'],
      ['user', 'الرقم من طوابع الوقت في نظام التقارير، وليس من استبيان. أستطيع عرض خط الأساس.'],
    ],
  },
};

function buildTranscript(id: string, pairs: Array<[string, string]>): Transcript {
  let clock = 0;
  const turns: Turn[] = pairs.map(([speaker, text], index) => {
    const latencyBefore = speaker === 'user' ? 900 : 400;
    clock += latencyBefore;
    const words = synthesiseWords(text, clock);
    const last = words[words.length - 1];
    const turn: Turn = {
      index, speaker: speaker as 'user' | 'persona', text,
      startMs: words[0]?.startMs ?? clock,
      endMs: last?.endMs ?? clock,
      words,
      latencyBeforeMs: latencyBefore,
      isChallenge: speaker === 'persona' && index > 0,
    };
    clock = turn.endMs;
    return turn;
  });
  return { sessionId: id, language: lang, turns };
}

/** Quote helper: pull a real span so fixtures pass the verifier honestly. */
const q = (t: Transcript, turnIdx: number, from: number, count: number) =>
  t.turns[turnIdx]!.words.slice(from, from + count).map((w) => w.text).join(' ');

function fixtureFor(t: Transcript, attempt: 1 | 2) {
  const weakTurn = attempt === 1 ? 1 : 1;
  const realQuote = q(t, weakTurn, 0, 8);
  const realQuote2 = q(t, 3, 0, 6);

  const contentPass = {
    strengths: attempt === 2 ? [{
      dimension: 'evidence_and_quantification', severity: 'significant',
      finding: 'The claim was tied to a measurable baseline and timeframe.',
      evidence: [{ quote: realQuote }],
      whyItMatters: 'A sceptical executive can verify this, which converts a claim into a credential.',
      recommendedChange: 'Keep this pattern: number, baseline, timeframe.',
    }] : [],
    weaknesses: attempt === 1 ? [
      {
        dimension: 'conclusion_positioning', severity: 'major',
        finding: 'The response narrated the process before reaching any position.',
        evidence: [{ quote: realQuote }],
        whyItMatters: 'The interviewer asked for a decision and received a method, which reads as operational rather than executive.',
        recommendedChange: 'Open with the decision you made, then give at most two supporting details.',
      },
      // Deliberately hallucinated — the verifier MUST drop this one.
      {
        dimension: 'ownership', severity: 'major',
        finding: 'The answer avoided personal accountability.',
        evidence: [{ quote: 'I have never taken responsibility for anything in my career' }],
        whyItMatters: 'Fabricated evidence.',
        recommendedChange: 'This finding should not survive verification.',
      },
      // Deliberately trait-shaped — the verifier MUST drop this one too.
      {
        dimension: 'pressure_integrity', severity: 'significant',
        finding: 'You are defensive when challenged.',
        evidence: [{ quote: realQuote2 }],
        whyItMatters: 'Trait language.',
        recommendedChange: 'This finding should not survive verification either.',
      },
    ] : [],
    dimensions: [
      { dimension: 'conclusion_positioning', band: attempt === 1 ? 'needs_attention' : 'strong', rationale: 'r', evidence: [{ quote: realQuote }] },
      { dimension: 'ownership', band: attempt === 1 ? 'developing' : 'effective', rationale: 'r', evidence: [] },
    ],
  };

  const executivePass = {
    strengths: [], weaknesses: [],
    dimensions: [{ dimension: 'compression', band: attempt === 1 ? 'critical' : 'effective', rationale: 'r', evidence: [] }],
    seniority: {
      soundsLike: attempt === 1 ? 'senior_manager' : 'executive_director',
      why: attempt === 1
        ? 'The answer led with method and team process rather than a decision and its enterprise consequence.'
        : 'The answer names a personal decision taken against internal resistance and attaches it to a measured outcome.',
      lift: attempt === 1
        ? 'Open with the decision and the consequence; hold the method back until asked.'
        : 'Add the trade-off you accepted when you made the call.',
      evidence: [{ quote: realQuote }],
    },
  };

  const personaPass = {
    weaknesses: [], dimensions: [],
    stakeholderPerception: attempt === 1
      ? 'A COO would likely conclude this candidate is competent at delivery but has not yet demonstrated they decide at group level.'
      : 'A COO would likely conclude this candidate makes and defends calls, and would probe the trade-off next.',
  };

  const mirrorPass = {
    mirror: [
      {
        dimension: 'decision_orientation',
        observable: attempt === 1
          ? 'The response described five sequential activities and no decision point.'
          : 'The response opened with a decision taken against internal resistance.',
        perception: attempt === 1
          ? 'A COO could read this as someone who runs a good process but does not own the call.'
          : 'A COO could read this as someone who takes a position and can defend it.',
        evidence: [{ quote: realQuote }],
      },
      // Unevidenced — must be dropped.
      { dimension: 'warmth', observable: 'n/a', perception: 'Cannot be supported.', evidence: [] },
    ],
    bestMoment: { quote: attempt === 2 ? realQuote : realQuote2, analysis: 'The most concrete moment in the answer.' },
    weakestMoment: { quote: realQuote, analysis: 'Where the answer drifted into method.' },
    retryObjective: {
      id: 'lead-with-decision',
      statement: lang === 'ar'
        ? 'أعد الإجابة على نفس السؤال: ابدأ بالقرار الذي اتخذته أنت، ثم أعط تفصيلين على الأكثر.'
        : 'Answer the same question again: open with the decision you personally made, then give at most two supporting details.',
      targetMetricKey: 'conclusion_latency_words',
      targetDirection: 'decrease',
    },
  };

  return { contentPass, executivePass, personaPass, mirrorPass };
}

/** Mock LLM that serves each pass its fixture in call order. */
class ScriptedLlm extends MockLlmProvider {
  private queue: unknown[];
  constructor(fx: ReturnType<typeof fixtureFor>) {
    super('mock-analysis-v1');
    this.queue = [fx.contentPass, fx.executivePass, fx.personaPass, fx.mirrorPass];
  }
  override async json<T>(): Promise<T> {
    // Passes 1-3 run in parallel, so order within them is not guaranteed;
    // each fixture is self-describing, so serving in queue order is fine here.
    return (this.queue.shift() ?? {}) as T;
  }
}

// ---------------------------------------------------------------- run

const line = (s = '') => console.log(s);
const rule = (t: string) => { line(); line(`${'='.repeat(72)}`); line(t); line('='.repeat(72)); };

async function main() {
  rule(`EXECUTIVE MIRROR — end-to-end journey (${lang.toUpperCase()})`);
  line(`scenario : ${lang === 'ar' ? cfg.scenario.label_ar : cfg.scenario.label_en}`);
  line(`persona  : ${lang === 'ar' ? cfg.persona.label_ar : cfg.persona.label_en}`);
  line(`rubric   : ${cfg.rubric.id} v${cfg.rubric.version} (${cfg.rubric.status})`);
  line(`lexicon  : ${cfg.lexicon.language} v${cfg.lexicon.version}`);

  const sys = buildPersonaSystemPrompt(cfg);
  line(`\npersona system prompt: ${sys.length} chars, ${sys.split('\n').length} lines (pinned + cached)`);

  const ex = EXCHANGES[lang];

  // ---- Attempt 1 --------------------------------------------------------
  rule('ATTEMPT 1');
  const t1 = buildTranscript('demo-1', ex.attempt1);
  const r1 = await analyseSession(t1, cfg, new ScriptedLlm(fixtureFor(t1, 1)));

  line('\n-- Pass 0: objective metrics --');
  for (const m of r1.metrics.metrics.filter((m) => m.tier === 'objective').slice(0, 8)) {
    line(`   ${m.label.padEnd(34)} ${String(m.value).padStart(7)} ${m.unit}`);
  }
  line('\n-- Pass 0: semi-objective (rule-based) --');
  for (const m of r1.metrics.metrics.filter((m) => m.tier === 'semi_objective')) {
    line(`   ${m.label.padEnd(34)} ${String(m.value).padStart(7)} ${m.unit}   [${m.ruleVersion}]`);
  }

  line('\n-- Evidence enforcement --');
  line(`   accepted weaknesses : ${r1.evaluation.weaknesses.length}`);
  line(`   accepted mirror     : ${r1.evaluation.mirror.length}`);
  line(`   REJECTED            : ${r1.evaluation.rejected.length}`);
  for (const rj of r1.evaluation.rejected) {
    line(`     x [${rj.reason}] ${rj.detail.slice(0, 90)}`);
  }

  line('\n-- Executive Mirror --');
  for (const m of r1.evaluation.mirror) {
    line(`   ${m.dimension}:`);
    line(`     observable : ${m.observable}`);
    line(`     perception : ${m.perception}`);
    line(`     evidence   : "${m.evidence[0]?.quote.slice(0, 60)}…" @${m.evidence[0]?.startMs}ms`);
  }

  line('\n-- Seniority --');
  line(`   sounds like : ${r1.evaluation.seniority.soundsLike}  (scenario expects ${cfg.scenario.target_seniority})`);
  line(`   why         : ${r1.evaluation.seniority.why}`);
  line(`   lift        : ${r1.evaluation.seniority.lift}`);

  line('\n-- Stakeholder perception --');
  line(`   ${r1.evaluation.stakeholderPerception}`);

  line('\n-- THE ONE THING TO CHANGE --');
  line(`   ${r1.evaluation.retryObjective.statement}`);
  line(`   bound to metric: ${r1.evaluation.retryObjective.targetMetricKey} (${r1.evaluation.retryObjective.targetDirection})`);

  // ---- Attempt 2 --------------------------------------------------------
  rule('ATTEMPT 2 (retry with that single focus)');
  const t2 = buildTranscript('demo-2', ex.attempt2);
  const r2 = await analyseSession(t2, cfg, new ScriptedLlm(fixtureFor(t2, 2)));

  // ---- Comparison -------------------------------------------------------
  rule('COMPARISON — did it actually improve?');
  const cmp = compareAttempts(r1, r2, r1.evaluation.retryObjective);

  line(`\nOBJECTIVE: ${cmp.objective.statement}`);
  line(`\nVERDICT: ${cmp.targetOutcome.verdict.toUpperCase()}`);
  line(`   ${cmp.targetOutcome.explanation}`);

  // pctChange is legitimately null when the baseline was 0 (nothing to divide by).
  const pct = (p: number | null) => (p === null ? 'from zero' : `${p > 0 ? '+' : ''}${p}%`);
  line('\n-- Improved --');
  for (const d of cmp.improved) line(`   ✓ ${d.label.padEnd(30)} ${d.before}${d.unit} → ${d.after}${d.unit}  (${pct(d.pctChange)})`);
  line('\n-- Regressed --');
  if (cmp.regressed.length === 0) line('   (none)');
  for (const d of cmp.regressed) line(`   ✗ ${d.label.padEnd(30)} ${d.before}${d.unit} → ${d.after}${d.unit}  (${pct(d.pctChange)})`);

  line('\n-- Band movement (reported, never the headline) --');
  for (const b of cmp.bandMovements) line(`   ${b.direction === 'improved' ? '↑' : '↓'} ${b.dimension}: ${b.before} → ${b.after}`);

  line('\n-- Weakness tracking --');
  line(`   resolved   : ${cmp.resolvedWeaknesses.join(', ') || '(none)'}`);
  line(`   persistent : ${cmp.persistentWeaknesses.join(', ') || '(none)'}`);
  line(`   new        : ${cmp.newWeaknesses.join(', ') || '(none)'}`);

  line('\n-- Seniority movement --');
  line(`   ${r1.evaluation.seniority.soundsLike} → ${r2.evaluation.seniority.soundsLike}`);

  rule('TIMINGS (mock providers — real latency depends on vendors)');
  line(`   attempt 1: ${JSON.stringify(r1.timings)}`);
  line(`   attempt 2: ${JSON.stringify(r2.timings)}`);
  line();
}

main().catch((e) => { console.error(e); process.exit(1); });
