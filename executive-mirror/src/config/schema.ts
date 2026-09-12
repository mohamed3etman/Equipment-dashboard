import { z } from 'zod';

/**
 * Config is validated on load and fails loudly. (V2 §33)
 * A malformed rubric must never reach the evaluator silently — a rubric that
 * half-loads produces coaching that looks fine and is wrong.
 */

const LexGroup = z.object({
  single: z.array(z.string()).optional(),
  phrases: z.array(z.array(z.string())).optional(),
  context_dependent: z.array(z.string()).optional(),
});

export const LexiconSchema = z.object({
  id: z.literal('lexicon'),
  language: z.enum(['en', 'ar']),
  version: z.number().int().positive(),
  fillers: LexGroup.optional(),
  hedges: LexGroup.optional(),
  apologies: LexGroup.optional(),
  ownership_positive: LexGroup.optional(),
  courtesy_markers: z.object({
    deference: z.array(z.string()).optional(),
    gratitude: z.array(z.string()).optional(),
    religious: z.array(z.string()).optional(),
  }).optional(),
  quantification_markers: z.object({ patterns: z.array(z.string()) }).optional(),
  jargon: z.record(z.array(z.string())).optional(),
  english_terms_accepted_in_arabic: z.array(z.string()).optional(),
});
export type Lexicon = z.infer<typeof LexiconSchema>;

export const BandSchema = z.enum(['strong', 'effective', 'developing', 'needs_attention', 'critical']);

export const EvidenceRulesSchema = z.object({
  id: z.literal('evidence-rules'),
  version: z.number().int().positive(),
  rules: z.array(z.object({
    id: z.string(),
    description: z.string(),
    enforced_in: z.enum(['code', 'schema', 'prompt']),
  })),
  bands: z.array(z.object({
    id: BandSchema, label_en: z.string(), label_ar: z.string(), rank: z.number(),
  })),
  forbidden_outputs: z.array(z.string()),
});
export type EvidenceRules = z.infer<typeof EvidenceRulesSchema>;

const RubricDimension = z.object({
  id: z.string(),
  label: z.string(),
  label_en: z.string().optional(),
  pass: z.enum(['content', 'executive', 'persona']),
  weight: z.enum(['critical', 'high', 'medium', 'low']),
  strong: z.string().optional(),
  strong_en: z.string().optional(),
  weakened_by: z.array(z.string()).optional(),
  weakened_by_en: z.array(z.string()).optional(),
  measured_with: z.union([z.string(), z.array(z.string())]).optional(),
  probe: z.string().optional(),
  note: z.string().optional(),
  segmented: z.boolean().optional(),
  calibration_note: z.string().optional(),
  // Arabic-specific structures
  never_penalise: z.array(z.string()).optional(),
  flag_only_when: z.unknown().optional(),
  weakening_patterns: z.unknown().optional(),
  accepted_registers: z.unknown().optional(),
  explicitly_not_penalised: z.array(z.string()).optional(),
  stance: z.string().optional(),
  never_flag: z.array(z.string()).optional(),
  arabic_specific_signals: z.unknown().optional(),
}).passthrough();

export const RubricSchema = z.object({
  id: z.string(),
  language: z.enum(['en', 'ar']),
  version: z.number().int().positive(),
  status: z.enum(['stable', 'developing', 'experimental']),
  extends: z.string().optional(),
  label: z.string(),
  shared_with_en: z.array(z.string()).optional(),
  dimensions: z.array(RubricDimension).min(1),
  answer_framework: z.unknown().optional(),
  seniority: z.object({
    ladder: z.array(z.string()),
    output_shape: z.string(),
  }).passthrough(),
  executive_mirror: z.object({
    frame: z.string(),
    frame_en: z.string().optional(),
    dimensions: z.array(z.string()).min(1),
    output_rule: z.string(),
  }).passthrough(),
}).passthrough();
export type Rubric = z.infer<typeof RubricSchema>;

const Bilingual = z.object({ en: z.string(), ar: z.string() });

export const ScenarioSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  label_en: z.string(),
  label_ar: z.string(),
  category: z.string(),
  languages: z.array(z.enum(['en', 'ar'])).min(1),
  default_duration_minutes: z.number().positive(),
  min_duration_minutes: z.number().positive(),
  max_duration_minutes: z.number().positive(),
  target_seniority: z.string(),
  answer_framework_expected: z.boolean(),
  audience: Bilingual,
  situation: Bilingual,
  user_objectives: z.object({ en: z.array(z.string()), ar: z.array(z.string()) }),
  opening_questions: z.object({
    en: z.array(z.object({ id: z.string(), text: z.string(), probes: z.array(z.string()) })).min(1),
    ar: z.array(z.object({ id: z.string(), text: z.string(), probes: z.array(z.string()) })).min(1),
  }),
  challenge_bank: z.object({ en: z.array(z.string()).min(1), ar: z.array(z.string()).min(1) }),
  response_targets: z.object({
    words_per_response: z.object({
      ideal_min: z.number(), ideal_max: z.number(), hard_max: z.number(),
    }),
    conclusion_latency_words: z.object({
      en: z.object({ ideal_max: z.number(), concern_above: z.number() }),
      ar: z.object({ ideal_max: z.number(), concern_above: z.number() }),
    }),
    response_duration_seconds: z.object({ ideal_min: z.number(), ideal_max: z.number() }),
  }),
  rubric: z.object({ en: z.string(), ar: z.string() }),
  emphasis: z.array(z.string()).optional(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const PersonaSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  label_en: z.string(),
  label_ar: z.string(),
  languages: z.array(z.enum(['en', 'ar'])).min(1),
  compatible_scenarios: z.array(z.string()),
  role: Bilingual,
  objectives: z.array(z.string()).min(1),
  personality: z.object({
    traits: z.array(z.string()),
    warmth: z.string(),
    never: z.array(z.string()),
    note: z.string().optional(),
  }),
  knowledge_boundaries: z.object({
    domain_literacy: z.record(z.string()),
    behaviour_at_boundary: z.string(),
    must_not_know: z.array(z.string()),
  }),
  questioning_style: z.object({
    opening: z.string(),
    turn_shape: z.object({
      max_sentences: z.number().int().positive(),
      typical_sentences: z.number().int().positive(),
      note: z.string().optional(),
    }),
    never: z.array(z.string()),
  }),
  pressure_behaviour: z.object({
    triggers: z.array(z.object({ id: z.string(), when: z.string(), response: z.string() })),
  }),
  interruption_behaviour: z.object({
    enabled: z.boolean(),
    interrupt_after_ms: z.number().int().nonnegative(),
    max_interruptions_per_session: z.number().int().nonnegative(),
    style: z.string(),
  }),
  escalation: z.object({
    ladder: z.array(z.object({ level: z.number(), label: z.string(), behaviour: z.string() })),
    rule: z.string(),
  }),
  response_to_weak_answers: z.array(z.string()),
  response_to_strong_answers: z.array(z.string()),
  confidence_model: z.object({
    gains_confidence_when: z.array(z.string()),
    loses_confidence_when: z.array(z.string()),
  }),
  language_behaviour: z.object({
    mirrors_user_language: z.boolean(),
    rule: z.string(),
    arabic_register: z.string().optional(),
    arabic_note: z.string().optional(),
  }),
  voice: z.record(z.record(z.string())),
});
export type Persona = z.infer<typeof PersonaSchema>;

const LabelPair = z.object({ en: z.string(), ar: z.string() });

export const LabelsSchema = z.object({
  id: z.literal('labels'),
  version: z.number().int().positive(),
  dimensions: z.record(LabelPair),
  seniority: z.record(LabelPair),
  tier_notes: z.record(LabelPair),
});
export type Labels = z.infer<typeof LabelsSchema>;
