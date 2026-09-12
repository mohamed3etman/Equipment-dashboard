/** JSON schemas handed to the model for structured output. */

const evidenceItem = {
  type: 'object',
  additionalProperties: false,
  required: ['quote'],
  properties: {
    quote: { type: 'string', description: 'VERBATIM span copied from a [user turn] block' },
  },
} as const;

const finding = {
  type: 'object',
  additionalProperties: false,
  required: ['dimension', 'severity', 'finding', 'evidence', 'whyItMatters', 'recommendedChange'],
  properties: {
    dimension: { type: 'string' },
    severity: { type: 'string', enum: ['minor', 'significant', 'major'] },
    finding: { type: 'string' },
    evidence: { type: 'array', minItems: 1, items: evidenceItem },
    whyItMatters: { type: 'string' },
    recommendedChange: { type: 'string' },
  },
} as const;

const dimensionAssessment = {
  type: 'object',
  additionalProperties: false,
  required: ['dimension', 'band', 'rationale', 'evidence'],
  properties: {
    dimension: { type: 'string' },
    band: { type: 'string', enum: ['strong', 'effective', 'developing', 'needs_attention', 'critical'] },
    rationale: { type: 'string' },
    evidence: { type: 'array', items: evidenceItem },
  },
} as const;

export const CONTENT_PASS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['strengths', 'weaknesses', 'dimensions'],
  properties: {
    strengths: { type: 'array', items: finding },
    weaknesses: { type: 'array', items: finding },
    dimensions: { type: 'array', items: dimensionAssessment },
  },
} as const;

export const EXECUTIVE_PASS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['strengths', 'weaknesses', 'dimensions', 'seniority'],
  properties: {
    strengths: { type: 'array', items: finding },
    weaknesses: { type: 'array', items: finding },
    dimensions: { type: 'array', items: dimensionAssessment },
    seniority: {
      type: 'object',
      additionalProperties: false,
      required: ['soundsLike', 'why', 'lift', 'evidence'],
      properties: {
        soundsLike: { type: 'string' },
        why: { type: 'string' },
        lift: { type: 'string' },
        evidence: { type: 'array', items: evidenceItem },
      },
    },
  },
} as const;

export const PERSONA_PASS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['weaknesses', 'dimensions', 'stakeholderPerception'],
  properties: {
    strengths: { type: 'array', items: finding },
    weaknesses: { type: 'array', items: finding },
    dimensions: { type: 'array', items: dimensionAssessment },
    stakeholderPerception: { type: 'string' },
  },
} as const;

export const MIRROR_PASS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mirror', 'bestMoment', 'weakestMoment', 'retryObjective'],
  properties: {
    mirror: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dimension', 'observable', 'perception', 'evidence'],
        properties: {
          dimension: { type: 'string' },
          observable: { type: 'string', description: 'The feature actually present in the response' },
          perception: { type: 'string', description: 'What a listener would plausibly conclude from it' },
          evidence: { type: 'array', minItems: 1, items: evidenceItem },
        },
      },
    },
    bestMoment: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['quote', 'analysis'],
      properties: { quote: { type: 'string' }, analysis: { type: 'string' } },
    },
    weakestMoment: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['quote', 'analysis'],
      properties: { quote: { type: 'string' }, analysis: { type: 'string' } },
    },
    retryObjective: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'statement'],
      properties: {
        id: { type: 'string' },
        statement: { type: 'string', description: 'ONE specific behavioural objective for the re-attempt' },
        targetMetricKey: { type: 'string' },
        targetDirection: { type: 'string', enum: ['increase', 'decrease'] },
        targetDimension: { type: 'string' },
      },
    },
  },
} as const;
