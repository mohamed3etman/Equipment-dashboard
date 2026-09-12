import type { Lang } from '@/analysis/normalize';
export type { Lang };

/** A single recognised word with timing. The foundation of every metric. */
export interface Word {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  /** Script tag, for code-switch reporting. Never used to penalise. */
  script?: 'arabic' | 'latin' | 'other';
}

export type Speaker = 'user' | 'persona';

export interface Turn {
  index: number;
  speaker: Speaker;
  text: string;
  startMs: number;
  endMs: number;
  words: Word[];
  /** ms between the previous turn ending and this turn starting. */
  latencyBeforeMs?: number;
  /** True when the persona cut the user off, or vice versa. */
  interrupted?: boolean;
  /** Set on persona turns drawn from the scenario's challenge_bank. */
  isChallenge?: boolean;
}

export interface Transcript {
  sessionId: string;
  language: Lang;
  turns: Turn[];
}

/** Metric tiering — V2 §12. Kept structural, not a UI convention. */
export type MetricTier = 'objective' | 'semi_objective';

export interface Metric {
  key: string;
  label: string;
  value: number;
  unit: string;
  tier: MetricTier;
  /** For semi-objective metrics: which lexicon/rule version produced this. */
  ruleVersion?: string;
  /** Spans the metric counted, so the UI can show its work. */
  spans?: EvidenceSpan[];
  /** Scenario target, when one is declared. */
  target?: { idealMin?: number; idealMax?: number; concernAbove?: number };
}

export interface EvidenceSpan {
  turnIndex: number;
  quote: string;
  startMs: number;
  endMs: number;
}

export type Band = 'strong' | 'effective' | 'developing' | 'needs_attention' | 'critical';

export const BAND_RANK: Record<Band, number> = {
  strong: 5, effective: 4, developing: 3, needs_attention: 2, critical: 1,
};

export type Severity = 'minor' | 'significant' | 'major';

/** V2 §14 — the four-part finding. All parts required. */
export interface Finding {
  dimension: string;
  severity: Severity;
  finding: string;
  evidence: EvidenceSpan[];
  whyItMatters: string;
  recommendedChange: string;
  /** Set by the verifier when a numeric claim could not be matched to Pass 0. */
  numericReviewFlag?: boolean;
}

export interface DimensionAssessment {
  dimension: string;
  band: Band;
  rationale: string;
  evidence: EvidenceSpan[];
}

export interface MirrorPerception {
  dimension: string;
  observable: string;
  perception: string;
  evidence: EvidenceSpan[];
}

export interface SeniorityRead {
  soundsLike: string;
  why: string;
  lift: string;
  evidence: EvidenceSpan[];
}

export interface Evaluation {
  sessionId: string;
  language: Lang;
  rubricId: string;
  rubricVersion: number;
  modelId: string;
  createdAt: string;
  strengths: Finding[];
  weaknesses: Finding[];
  dimensions: DimensionAssessment[];
  mirror: MirrorPerception[];
  seniority: SeniorityRead;
  bestMoment: { span: EvidenceSpan; analysis: string } | null;
  weakestMoment: { span: EvidenceSpan; analysis: string } | null;
  stakeholderPerception: string;
  /** Exactly one. V2 §17. */
  retryObjective: RetryObjective;
  /** Findings dropped by the verifier, kept for debugging. Never shown as results. */
  rejected: RejectedFinding[];
}

export interface RetryObjective {
  id: string;
  statement: string;
  /** The metric whose movement will show whether the retry worked. */
  targetMetricKey?: string;
  targetDirection?: 'increase' | 'decrease';
  targetDimension?: string;
}

export interface RejectedFinding {
  reason: 'no_evidence' | 'quote_not_found' | 'persona_turn' | 'missing_part' | 'trait_language';
  raw: unknown;
  detail: string;
}
