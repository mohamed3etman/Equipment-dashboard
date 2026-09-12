/**
 * Simulated session. Runs the REAL pipeline (Pass 0-4, evidence enforcement,
 * retry comparison) against a scripted exchange, so the whole journey is
 * walkable before vendor keys exist. Used by the CLI demo and by the app when
 * providers are mocked.
 *
 * The fixtures deliberately include three findings that MUST be rejected —
 * a hallucinated quote, trait language, and an unevidenced perception — so the
 * evidence layer is visibly exercised rather than assumed.
 */
import { loadLabels, loadSessionConfig } from '@/config/loader';
import { analyseSession, type AnalyseResult } from '@/analysis/pipeline';
import { compareAttempts, type RetryComparison } from '@/analysis/compare';
import { MockLlmProvider, synthesiseWords } from '@/providers/mock';
import type { Lang, Transcript, Turn } from '@/lib/types';

export const SCRIPTED: Record<Lang, { attempt1: Array<[string, string]>; attempt2: Array<[string, string]> }> = {
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

export function buildScriptedTranscript(id: string, lang: Lang, pairs: Array<[string, string]>): Transcript {
  let clock = 0;
  const turns: Turn[] = pairs.map(([speaker, text], index) => {
    clock += speaker === 'user' ? 900 : 400;
    const words = synthesiseWords(text, clock);
    const last = words[words.length - 1];
    const turn: Turn = {
      index, speaker: speaker as 'user' | 'persona', text,
      startMs: words[0]?.startMs ?? clock,
      endMs: last?.endMs ?? clock,
      words,
      latencyBeforeMs: speaker === 'user' ? 900 : 400,
      isChallenge: speaker === 'persona' && index > 0,
    };
    clock = turn.endMs;
    return turn;
  });
  return { sessionId: id, language: lang, turns };
}

const q = (t: Transcript, turnIdx: number, from: number, count: number) =>
  t.turns[turnIdx]!.words.slice(from, from + count).map((w) => w.text).join(' ');

function fixtures(t: Transcript, attempt: 1 | 2, lang: Lang) {
  const real = q(t, 1, 0, 9);
  const real2 = q(t, 3, 0, 6);

  return [
    // Pass 1 — content
    {
      strengths: attempt === 2 ? [{
        dimension: 'evidence_and_quantification', severity: 'significant',
        finding: lang === 'ar'
          ? 'الادعاء ارتبط بخط أساس قابل للقياس وإطار زمني محدد.'
          : 'The claim was tied to a measurable baseline and a timeframe.',
        evidence: [{ quote: real }],
        whyItMatters: lang === 'ar'
          ? 'المسؤول المتشكك يستطيع التحقق من هذا، وهو ما يحوّل الادعاء الى مؤهل.'
          : 'A sceptical executive can verify this, which turns a claim into a credential.',
        recommendedChange: lang === 'ar'
          ? 'حافظ على هذا النمط: رقم، خط أساس، إطار زمني.'
          : 'Keep this pattern: number, baseline, timeframe.',
      }] : [],
      weaknesses: attempt === 1 ? [
        {
          dimension: 'conclusion_positioning', severity: 'major',
          finding: lang === 'ar'
            ? 'الإجابة سردت الإجراء قبل الوصول الى أي موقف.'
            : 'The response narrated the process before reaching any position.',
          evidence: [{ quote: real }],
          whyItMatters: lang === 'ar'
            ? 'السؤال كان عن قرار والإجابة كانت عن منهجية، وهو ما يُقرأ كمستوى تشغيلي لا تنفيذي.'
            : 'The interviewer asked for a decision and received a method, which reads as operational rather than executive.',
          recommendedChange: lang === 'ar'
            ? 'ابدأ بالقرار الذي اتخذته، ثم أعط تفصيلين على الأكثر.'
            : 'Open with the decision you made, then give at most two supporting details.',
        },
        // MUST be rejected: quote does not exist in the transcript.
        {
          dimension: 'ownership', severity: 'major',
          finding: 'The answer avoided personal accountability.',
          evidence: [{ quote: 'I have never taken responsibility for anything in my career' }],
          whyItMatters: 'Fabricated evidence — this finding must not survive verification.',
          recommendedChange: 'n/a',
        },
        // MUST be rejected: trait language.
        {
          dimension: 'pressure_integrity', severity: 'significant',
          finding: 'You are defensive when challenged.',
          evidence: [{ quote: real2 }],
          whyItMatters: 'Trait language — this finding must not survive verification.',
          recommendedChange: 'n/a',
        },
      ] : [],
      dimensions: [
        { dimension: 'conclusion_positioning', band: attempt === 1 ? 'needs_attention' : 'strong', rationale: '', evidence: [{ quote: real }] },
        { dimension: 'ownership', band: attempt === 1 ? 'developing' : 'effective', rationale: '', evidence: [] },
        { dimension: 'evidence_and_quantification', band: attempt === 1 ? 'critical' : 'strong', rationale: '', evidence: [] },
      ],
    },
    // Pass 2 — executive
    {
      strengths: [], weaknesses: [],
      dimensions: [
        { dimension: 'compression', band: attempt === 1 ? 'critical' : 'effective', rationale: '', evidence: [] },
        { dimension: 'decision_orientation', band: attempt === 1 ? 'needs_attention' : 'strong', rationale: '', evidence: [] },
      ],
      seniority: {
        soundsLike: attempt === 1 ? 'senior_manager' : 'executive_director',
        why: attempt === 1
          ? (lang === 'ar'
            ? 'الإجابة قدّمت المنهجية وعمل الفريق بدلاً من القرار وأثره على المؤسسة.'
            : 'The answer led with method and team process rather than a decision and its enterprise consequence.')
          : (lang === 'ar'
            ? 'الإجابة تسمّي قراراً شخصياً اتُخذ رغم معارضة داخلية وتربطه بنتيجة مقاسة.'
            : 'The answer names a personal decision taken against internal resistance and attaches it to a measured outcome.'),
        lift: attempt === 1
          ? (lang === 'ar'
            ? 'ابدأ بالقرار وأثره، وأخّر المنهجية حتى تُطلب.'
            : 'Open with the decision and the consequence; hold the method back until asked.')
          : (lang === 'ar'
            ? 'أضف المفاضلة التي قبلتها عندما اتخذت القرار.'
            : 'Add the trade-off you accepted when you made the call.'),
        evidence: [{ quote: real }],
      },
    },
    // Pass 3 — persona reception
    {
      weaknesses: [], dimensions: [],
      stakeholderPerception: attempt === 1
        ? (lang === 'ar'
          ? 'الرئيس التنفيذي للعمليات سيخرج على الأرجح بأن المرشح كفء في التنفيذ لكنه لم يُظهر بعد أنه يقرر على مستوى المجموعة.'
          : 'A COO would likely conclude this candidate is competent at delivery but has not yet demonstrated they decide at group level.')
        : (lang === 'ar'
          ? 'الرئيس التنفيذي للعمليات سيخرج على الأرجح بأن المرشح يتخذ القرار ويدافع عنه، وسينتقل لاختبار المفاضلة.'
          : 'A COO would likely conclude this candidate makes and defends calls, and would probe the trade-off next.'),
    },
    // Pass 4 — mirror
    {
      mirror: [
        {
          dimension: 'decision_orientation',
          observable: attempt === 1
            ? (lang === 'ar' ? 'الإجابة وصفت خمسة أنشطة متتابعة ولم تذكر نقطة قرار واحدة.' : 'The response described five sequential activities and no decision point.')
            : (lang === 'ar' ? 'الإجابة بدأت بقرار اتُخذ رغم معارضة داخلية.' : 'The response opened with a decision taken against internal resistance.'),
          perception: attempt === 1
            ? (lang === 'ar' ? 'قد يقرأ هذا الرئيس التنفيذي على أنه شخص يدير عملية جيدة لكنه لا يتحمل القرار.' : 'A COO could read this as someone who runs a good process but does not own the call.')
            : (lang === 'ar' ? 'قد يقرأ هذا الرئيس التنفيذي على أنه شخص يتخذ موقفاً ويستطيع الدفاع عنه.' : 'A COO could read this as someone who takes a position and can defend it.'),
          evidence: [{ quote: real }],
        },
        {
          dimension: 'credibility',
          observable: attempt === 1
            ? (lang === 'ar' ? 'لم يرد أي رقم أو خط أساس في الإجابة.' : 'No number or baseline appeared anywhere in the answer.')
            : (lang === 'ar' ? 'الرقم جاء مع مصدره وخط أساسه.' : 'The number arrived with its source and its baseline.'),
          perception: attempt === 1
            ? (lang === 'ar' ? 'المستمع لا يملك ما يتحقق منه، فيبقى الادعاء غير مثبت.' : 'The listener has nothing to verify, so the claim stays unproven.')
            : (lang === 'ar' ? 'المستمع يستطيع التحقق، وهذا يرفع الثقة فوراً.' : 'The listener can verify it, which raises confidence immediately.'),
          evidence: [{ quote: attempt === 1 ? real2 : real }],
        },
        // MUST be rejected: no evidence.
        { dimension: 'warmth', observable: 'n/a', perception: 'Unsupported perception.', evidence: [] },
      ],
      bestMoment: { quote: attempt === 2 ? real : real2, analysis: lang === 'ar' ? 'أكثر لحظة محددة في الإجابة.' : 'The most concrete moment in the answer.' },
      weakestMoment: { quote: real, analysis: lang === 'ar' ? 'حيث انحرفت الإجابة الى المنهجية.' : 'Where the answer drifted into method.' },
      retryObjective: {
        id: 'lead-with-decision',
        statement: lang === 'ar'
          ? 'أعد الإجابة على السؤال نفسه: ابدأ بالقرار الذي اتخذته أنت، ثم أعط تفصيلين على الأكثر.'
          : 'Answer the same question again: open with the decision you personally made, then give at most two supporting details.',
        targetMetricKey: 'conclusion_latency_words',
        targetDirection: 'decrease',
      },
    },
  ];
}

/** Serves each analysis pass its fixture in call order. */
class ScriptedLlm extends MockLlmProvider {
  private queue: unknown[];
  constructor(fx: unknown[]) { super('mock-analysis-v1'); this.queue = fx; }
  override async json<T>(): Promise<T> { return (this.queue.shift() ?? {}) as T; }
}

export interface DemoRun {
  language: Lang;
  scenarioLabel: string;
  personaLabel: string;
  rubric: { id: string; version: number; status: string };
  attempt1: { transcript: Transcript; result: AnalyseResult };
  attempt2: { transcript: Transcript; result: AnalyseResult };
  comparison: RetryComparison;
}

export async function runDemoSession(lang: Lang): Promise<DemoRun> {
  const cfg = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', lang);
  const script = SCRIPTED[lang];

  const t1 = buildScriptedTranscript('demo-1', lang, script.attempt1);
  const r1 = await analyseSession(t1, cfg, new ScriptedLlm(fixtures(t1, 1, lang)));

  const t2 = buildScriptedTranscript('demo-2', lang, script.attempt2);
  const r2 = await analyseSession(t2, cfg, new ScriptedLlm(fixtures(t2, 2, lang)));

  return {
    language: lang,
    scenarioLabel: lang === 'ar' ? cfg.scenario.label_ar : cfg.scenario.label_en,
    personaLabel: lang === 'ar' ? cfg.persona.label_ar : cfg.persona.label_en,
    rubric: { id: cfg.rubric.id, version: cfg.rubric.version, status: cfg.rubric.status },
    attempt1: { transcript: t1, result: r1 },
    attempt2: { transcript: t2, result: r2 },
    comparison: compareAttempts(r1, r2, r1.evaluation.retryObjective),
  };
}

/** Flattened, language-resolved labels for the UI. */
export interface LabelMaps {
  dimensions: Record<string, string>;
  seniority: Record<string, string>;
  tierNotes: { objective: string; semi_objective: string; inferred: string };
}

export function resolveLabels(lang: Lang): LabelMaps {
  const l = loadLabels();
  const pick = (m: Record<string, { en: string; ar: string }>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v[lang]]));
  const notes = pick(l.tier_notes);
  return {
    dimensions: pick(l.dimensions),
    seniority: pick(l.seniority),
    tierNotes: {
      objective: notes.objective ?? '',
      semi_objective: notes.semi_objective ?? '',
      inferred: notes.inferred ?? '',
    },
  };
}
