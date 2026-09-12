/**
 * Failure-mode corpus. (Validation Gate 1 §6)
 *
 * Seven answer archetypes an executive actually produces under interview
 * pressure, written as realistic responses in the user's own domain rather
 * than as keyword caricatures. Each is a genuine answer a competent person
 * might give — the failure is in FUNCTION, not vocabulary, which is what the
 * evaluation has to detect.
 *
 * The same conceptual answer exists in English, Arabic and code-switched form.
 * The Arabic versions are NOT translations: an over-explaining Arabic answer
 * over-explains the way Arabic professional discourse actually does, and the
 * apologetic one uses the courtesy register rather than the word "sorry".
 */
import type { Lang } from '@/lib/types';

export type FailureMode =
  | 'excessive_apology'
  | 'over_explanation'
  | 'weak_conclusion'
  | 'no_quantified_impact'
  | 'technical_without_business'
  | 'defensive_under_challenge'
  | 'strong_executive';

export type Condition = 'en' | 'ar' | 'mixed';

export interface Sample {
  mode: FailureMode;
  condition: Condition;
  language: Lang;
  /** Exchange as [speaker, text]; challenge turns matter for mode 6. */
  exchange: Array<['persona' | 'user', string]>;
  /** What Pass 0 must show for this sample to be distinguishable. */
  expect: {
    /** Metrics that should be conspicuously HIGH relative to the control. */
    high?: string[];
    /** Metrics that should be conspicuously LOW relative to the control. */
    low?: string[];
    /** True when the deterministic layer alone cannot separate this mode. */
    requiresLlm?: boolean;
    note: string;
  };
}

const Q_EN = 'Walk me through what you personally decided that the organisation would not have decided without you.';
const Q_AR = 'ما القرار الذي اتخذته أنت شخصياً وما كانت المؤسسة لتتخذه بدونك؟';
const CHALLENGE_EN = 'That number sounds high to me. Who verified it?';
const CHALLENGE_AR = 'هذا الرقم يبدو مرتفعاً. من الذي تحقق منه؟';

export const SAMPLES: Sample[] = [
  // ---------------------------------------------------------------- 1
  {
    mode: 'excessive_apology', condition: 'en', language: 'en',
    exchange: [
      ['persona', Q_EN],
      ['user', "Sorry, I hope I understood the question correctly. I apologise if this is not exactly what you meant. I think, and sorry if I am taking too long, that the main thing was the document control system. Sorry, let me be clearer. I decided we should move it off paper. I apologise, I should have said that first."],
    ],
    expect: {
      high: ['apology_count'],
      note: 'Apology markers are dense and none acknowledges an actual error.',
    },
  },
  {
    mode: 'excessive_apology', condition: 'ar', language: 'ar',
    exchange: [
      ['persona', Q_AR],
      // Arabic apology is carried by courtesy formulas, not the word "sorry".
      ['user', 'أعتذر، أرجو أن أكون فهمت السؤال. المعذرة إن كنت أطلت عليكم. أعتذر مرة أخرى، لكن أهم شيء كان نظام ضبط الوثائق. عفواً، دعوني أوضح: أنا قررت نقله من الورق. أعتذر، كان يجب أن أبدأ بهذا.'],
    ],
    expect: {
      high: ['apology_count'],
      note: 'Arabic apology register is distinct from courtesy; the lexicon must separate اعتذر/المعذرة from سعادتكم/تفضلتم.',
    },
  },

  // ---------------------------------------------------------------- 2
  {
    mode: 'over_explanation', condition: 'en', language: 'en',
    exchange: [
      ['persona', Q_EN],
      ['user', "So the document control system was paper based, and there were seven departments involved, each with their own filing convention, and the medical records team had a separate index that did not reconcile with the quality department index. We started by mapping the workflow across all seven, which took about three weeks because we had to sit with each department head individually. Then we built a current-state process map, then a future-state map, then we ran a gap analysis against the CBAHI documentation standard, then we designed the electronic structure, then we piloted it in two departments, then we ran a second gap analysis, then we trained forty two staff across three sessions each, then we migrated the back catalogue which was another six weeks, and then we went live department by department over the following quarter."],
    ],
    expect: {
      high: ['words_per_response_mean', 'longest_monologue_s', 'words_per_response_max'],
      low: ['quantification_per_minute'],
      note: 'Every sentence is true and specific; the failure is that none of it is the decision the CEO asked for.',
    },
  },
  {
    mode: 'over_explanation', condition: 'ar', language: 'ar',
    exchange: [
      ['persona', Q_AR],
      ['user', 'نظام ضبط الوثائق كان ورقياً بالكامل، وكانت هناك سبع إدارات معنية، ولكل إدارة طريقتها في الأرشفة، وفريق السجلات الطبية كان لديه فهرس منفصل لا يتطابق مع فهرس إدارة الجودة. بدأنا بدراسة سير العمل في الإدارات السبع، واستغرق ذلك ثلاثة أسابيع لأننا جلسنا مع كل مدير إدارة على حدة. بعدها بنينا خريطة الوضع الحالي، ثم خريطة الوضع المستهدف، ثم أجرينا تحليل فجوة مقابل معيار التوثيق، ثم صممنا الهيكل الإلكتروني، ثم جربناه في إدارتين، ثم أعدنا تحليل الفجوة، ثم دربنا اثنين وأربعين موظفاً على ثلاث جلسات لكل مجموعة، ثم رحّلنا الأرشيف القديم وأخذ ستة أسابيع، ثم بدأ التشغيل إدارة تلو الأخرى خلال الربع التالي.'],
    ],
    expect: {
      high: ['words_per_response_mean', 'longest_monologue_s'],
      note: 'Arabic sequential narration — the same failure, expressed through ثم chaining.',
    },
  },

  // ---------------------------------------------------------------- 3
  {
    mode: 'weak_conclusion', condition: 'en', language: 'en',
    exchange: [
      ['persona', Q_EN],
      ['user', "The document control decision was significant. We had options: keep paper with better indexing, buy a commercial system, or build on the existing intranet. Each had trade-offs on cost, timeline and staff adoption. Commercial was fastest but expensive. Building was cheaper but slower. Paper was cheapest but would not have passed the next survey. So those were the considerations we were weighing at the time."],
    ],
    expect: {
      requiresLlm: true,
      note: 'CRITICAL GAP: the answer is well-structured, concise, and jargon-free — it simply never states which option was chosen. No deterministic metric separates it from the control. Detection requires Pass 1.',
    },
  },
  {
    mode: 'weak_conclusion', condition: 'ar', language: 'ar',
    exchange: [
      ['persona', Q_AR],
      ['user', 'قرار ضبط الوثائق كان مهماً. كانت أمامنا خيارات: الاستمرار بالورق مع فهرسة أفضل، أو شراء نظام جاهز، أو البناء على الشبكة الداخلية القائمة. لكل خيار مفاضلاته في التكلفة والزمن وتقبّل الموظفين. الجاهز أسرع لكنه مكلف. البناء أرخص لكنه أبطأ. الورق الأرخص لكنه لن يجتاز الزيارة القادمة. هذه كانت الاعتبارات التي كنا نوازن بينها.'],
    ],
    expect: {
      requiresLlm: true,
      note: 'Same gap in Arabic. Deterministic layer sees a clean, compressed answer.',
    },
  },

  // ---------------------------------------------------------------- 4
  {
    mode: 'no_quantified_impact', condition: 'en', language: 'en',
    exchange: [
      ['persona', Q_EN],
      ['user', "I decided to move document control off paper. It made a significant difference to turnaround. The improvement was substantial and the teams noticed it immediately. Leadership were very pleased with the outcome, and it materially strengthened our position going into the accreditation cycle."],
    ],
    expect: {
      low: ['quantification_count', 'quantification_per_minute'],
      note: 'Decision is stated and ownership is clear. The failure is that "significant", "substantial" and "materially" carry all the weight.',
    },
  },
  {
    mode: 'no_quantified_impact', condition: 'ar', language: 'ar',
    exchange: [
      ['persona', Q_AR],
      ['user', 'أنا قررت نقل ضبط الوثائق من الورق. الفرق كان كبيراً في زمن الإنجاز. التحسن كان ملحوظاً والفرق لاحظته مباشرة. القيادة كانت راضية جداً عن النتيجة، وقد عزز ذلك موقفنا بشكل واضح قبل دورة الاعتماد.'],
    ],
    expect: {
      low: ['quantification_count'],
      note: 'Arabic intensifiers (كبيراً، ملحوظاً، بشكل واضح) substituting for measurement.',
    },
  },

  // ---------------------------------------------------------------- 5
  {
    mode: 'technical_without_business', condition: 'en', language: 'en',
    exchange: [
      ['persona', Q_EN],
      ['user', "I decided we would restructure the OVR workflow. We moved from a paper incident form to an electronic OVR with mandatory RCA triggers on any sentinel event, and we mapped the CAPA closure loop into the same system. We also ran an FMEA on the medication reconciliation process and folded the resulting control plan into the risk register with PDSA cycles on each high-scoring failure mode."],
    ],
    expect: {
      high: ['jargon_density_per_100w'],
      low: ['quantification_count'],
      note: 'Every term is correct. The CEO persona declares clinical literacy as lay, so unexplained OVR/RCA/CAPA/FMEA/PDSA is a real failure against THIS audience — the jargon metric must be read against persona literacy, not absolutely.',
    },
  },
  {
    mode: 'technical_without_business', condition: 'mixed', language: 'ar',
    // Realistic Saudi healthcare register: Arabic syntax, English terms of art.
    exchange: [
      ['persona', Q_AR],
      ['user', 'قررت نعيد هيكلة الـ OVR workflow. نقلنا نموذج البلاغ من الورق الى OVR الكتروني مع RCA اجباري على أي sentinel event، وربطنا الـ CAPA closure loop بنفس النظام. وسوّينا FMEA على عملية الـ medication reconciliation وأدخلنا الـ control plan في الـ risk register مع PDSA على كل failure mode عالي الدرجة.'],
    ],
    expect: {
      high: ['jargon_density_per_100w', 'code_switch_events'],
      low: ['quantification_count'],
      note: 'Code-switching here is NORMAL Saudi healthcare register and must not itself be a finding. The failure is the same as the English case: depth beyond the audience with no business consequence. Jargon density must therefore fire on the English acronyms even though they appear inside Arabic speech.',
    },
  },

  // ---------------------------------------------------------------- 6
  {
    mode: 'defensive_under_challenge', condition: 'en', language: 'en',
    exchange: [
      ['persona', Q_EN],
      ['user', 'I decided to move document control off paper. Report turnaround went from 48 hours to 2 hours.'],
      ['persona', CHALLENGE_EN],
      ['user', "Well, I mean, I think the number is right. Obviously I did not personally time every report, so maybe it is not exact, but I think the team was fairly confident about it. To be honest it might have been closer to three hours in some departments, possibly more in others, I would need to check. I am not saying it was definitely 2 hours, I just think it was roughly in that range, more or less."],
    ],
    expect: {
      high: ['hedge_count', 'hedge_density_per_100w'],
      requiresLlm: true,
      note: 'Deterministic layer sees the hedge spike, but cannot see that it appeared ONLY AFTER the challenge — the segmented before/after comparison is a Pass 2 judgment.',
    },
  },
  {
    mode: 'defensive_under_challenge', condition: 'ar', language: 'ar',
    exchange: [
      ['persona', Q_AR],
      ['user', 'أنا قررت نقل ضبط الوثائق من الورق. زمن إصدار التقرير انخفض من ٤٨ ساعة الى ساعتين.'],
      ['persona', CHALLENGE_AR],
      // Arabic retreat: courtesy escalates and a religious formula replaces the claim.
      ['user', 'سعادتكم، أعتقد أن الرقم صحيح والله أعلم. طبعاً أنا ما قِست كل تقرير بنفسي، فربما ليس دقيقاً تماماً، لكن أظن الفريق كان واثقاً نوعاً ما. بصراحة ممكن يكون قريباً من ثلاث ساعات في بعض الإدارات. لا أقول إنه ساعتان بالضبط، فقط أعتقد أنه في هذا النطاق تقريباً.'],
    ],
    expect: {
      high: ['hedge_count'],
      requiresLlm: true,
      note: 'The Arabic-specific tell is courtesy ESCALATION after challenge (سعادتكم appears only in the second answer) plus والله أعلم closing a factual claim. Both are rubric judgments, not lexicon counts — the lexicon must NOT flag سعادتكم on its own.',
    },
  },

  // ---------------------------------------------------------------- 7 (control)
  {
    mode: 'strong_executive', condition: 'en', language: 'en',
    exchange: [
      ['persona', Q_EN],
      ['user', 'I decided to take document control fully electronic, over the objection of operations who ranked it fourth priority. I owned that call. Report turnaround went from 48 hours to 2 hours within one quarter, measured on system timestamps. The trade-off I accepted was delaying the OR scheduling project by six weeks.'],
    ],
    expect: {
      high: ['quantification_count', 'ownership_marker_count'],
      low: ['hedge_count', 'filler_count', 'apology_count', 'conclusion_latency_words'],
      note: 'CONTROL. Decision first, ownership explicit, quantified with a source, trade-off named, no padding. Every other sample is judged relative to this.',
    },
  },
  {
    mode: 'strong_executive', condition: 'ar', language: 'ar',
    exchange: [
      ['persona', Q_AR],
      ['user', 'أنا قررت تحويل ضبط الوثائق الى النظام الالكتروني بالكامل، رغم اعتراض العمليات التي صنّفته أولوية رابعة. تحملت هذا القرار. زمن إصدار التقرير انخفض من ٤٨ ساعة الى ساعتين خلال ربع واحد، مقاساً على طوابع وقت النظام. المفاضلة التي قبلتها هي تأخير مشروع جدولة العمليات ستة أسابيع.'],
    ],
    expect: {
      high: ['quantification_count', 'ownership_marker_count'],
      low: ['hedge_count', 'apology_count'],
      note: 'Arabic control. Note it opens directly with أنا قررت — no preamble — so conclusion latency should be at or near zero even under the more permissive Arabic threshold.',
    },
  },
  {
    mode: 'strong_executive', condition: 'mixed', language: 'ar',
    exchange: [
      ['persona', Q_AR],
      ['user', 'أنا قررت ننقل document control بالكامل الى النظام الالكتروني، رغم أن العمليات صنّفته أولوية رابعة. القرار قراري. الـ turnaround نزل من ٤٨ ساعة الى ساعتين خلال ربع واحد، مقاساً على timestamps النظام. المفاضلة كانت تأخير مشروع جدولة العمليات ستة أسابيع.'],
    ],
    expect: {
      high: ['quantification_count', 'code_switch_events'],
      low: ['hedge_count', 'apology_count'],
      note: 'A STRONG answer that also code-switches heavily. This is the false-positive guard: if code-switching drags the evaluation down, the bilingual claim in §3.3 is broken.',
    },
  },
];

export const CONTROL_MODE: FailureMode = 'strong_executive';
