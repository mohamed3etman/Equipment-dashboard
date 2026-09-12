/**
 * Relational model. (V2 §32)
 *
 * Design rules carried through every table:
 *   - Every user-owned row carries user_id, even at N=1, so multi-user is a
 *     change of scope rather than a rewrite. (V2 §2)
 *   - Every AI judgment is version-stamped with rubric AND model version.
 *     Without both, longitudinal comparison silently tracks model drift.
 *   - Evidence is a first-class row with a foreign key, not a JSON blob, so
 *     "show me the proof" is a query.
 *   - Metrics are rows, not columns — adding one is an insert, not a migration.
 *   - Retention is an attribute (recordings.expires_at), not a cron someone
 *     remembers to write. (V2 §36)
 */
import { relations } from 'drizzle-orm';
import {
  boolean, index, integer, jsonb, pgTable, real, text, timestamp, uuid, varchar,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------- identity

export const users = pgTable('users', {
  id: id(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  displayName: text('display_name'),
  primaryLanguage: varchar('primary_language', { length: 2 }).notNull().default('en'),
  createdAt: created(),
});

export const profiles = pgTable('profiles', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role'),
  seniority: varchar('seniority', { length: 40 }),
  industry: text('industry'),
  nativeLanguage: varchar('native_language', { length: 2 }),
  workingLanguages: jsonb('working_languages').$type<string[]>().default([]),
  targetRoles: jsonb('target_roles').$type<string[]>().default([]),
  updatedAt: created(),
});

// ---------------------------------------------------------------- events

/** A real, dated occasion the practice is for. The retention engine. (V2 §23) */
export const events = pgTable('events', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  eventType: varchar('event_type', { length: 40 }),
  eventDate: timestamp('event_date', { withTimezone: true }),
  role: text('role'),
  audience: text('audience'),
  objectives: jsonb('objectives').$type<string[]>().default([]),
  language: varchar('language', { length: 2 }),
  createdAt: created(),
}, (t) => ({ byUser: index('events_user_idx').on(t.userId, t.eventDate) }));

// ---------------------------------------------------------------- sessions

export const sessions = pgTable('sessions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),

  // Config is referenced by id + version, never copied, so a rubric change is
  // always traceable to the sessions it affected.
  scenarioId: varchar('scenario_id', { length: 80 }).notNull(),
  scenarioVersion: integer('scenario_version').notNull(),
  personaId: varchar('persona_id', { length: 80 }).notNull(),
  personaVersion: integer('persona_version').notNull(),
  language: varchar('language', { length: 2 }).notNull(),

  mode: varchar('mode', { length: 24 }).notNull().default('standard'), // standard | baseline | thirty_second
  status: varchar('status', { length: 24 }).notNull().default('created'),
  openingQuestionId: varchar('opening_question_id', { length: 80 }),

  /** Self-referential: the retry loop is a first-class relationship. (V2 §18) */
  retryOfSessionId: uuid('retry_of_session_id'),
  /** The single objective injected for a retry. */
  focusObjective: text('focus_objective'),
  focusMetricKey: varchar('focus_metric_key', { length: 60 }),

  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  createdAt: created(),
}, (t) => ({
  byUser: index('sessions_user_idx').on(t.userId, t.createdAt),
  byRetry: index('sessions_retry_idx').on(t.retryOfSessionId),
}));

export const recordings = pgTable('recordings', {
  id: id(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  /** User-only track, kept separate — analytics need clean single-speaker audio. */
  userTrackKey: text('user_track_key'),
  mixedTrackKey: text('mixed_track_key'),
  format: varchar('format', { length: 16 }).notNull().default('opus'),
  durationMs: integer('duration_ms'),
  bytes: integer('bytes'),
  /** Set at INSERT from EM_AUDIO_RETENTION_DAYS. Retention is data, not a job. */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: created(),
});

// ---------------------------------------------------------------- transcript

export const turns = pgTable('turns', {
  id: id(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(),
  speaker: varchar('speaker', { length: 12 }).notNull(),
  text: text('text').notNull(),
  startMs: integer('start_ms').notNull(),
  endMs: integer('end_ms').notNull(),
  latencyBeforeMs: integer('latency_before_ms'),
  interrupted: boolean('interrupted').default(false),
  isChallenge: boolean('is_challenge').default(false),
  /** Dominant script; null when genuinely mixed. Reported, never penalised. */
  dominantScript: varchar('dominant_script', { length: 8 }),
  createdAt: created(),
}, (t) => ({ bySession: index('turns_session_idx').on(t.sessionId, t.index) }));

/** Word-level timings. Every metric in Pass 0 derives from this table. */
export const words = pgTable('words', {
  id: id(),
  turnId: uuid('turn_id').notNull().references(() => turns.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(),
  text: text('text').notNull(),
  startMs: integer('start_ms').notNull(),
  endMs: integer('end_ms').notNull(),
  confidence: real('confidence'),
  script: varchar('script', { length: 8 }),
}, (t) => ({ byTurn: index('words_turn_idx').on(t.turnId, t.index) }));

// ---------------------------------------------------------------- analysis

/** Pass 0 output. Tier is stored so the UI separation is structural. (V2 §12) */
export const speechMetrics = pgTable('speech_metrics', {
  id: id(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  metricKey: varchar('metric_key', { length: 60 }).notNull(),
  label: text('label').notNull(),
  value: real('value').notNull(),
  unit: varchar('unit', { length: 16 }),
  tier: varchar('tier', { length: 20 }).notNull(),
  /** Which lexicon/rule version produced a semi-objective value. */
  ruleVersion: varchar('rule_version', { length: 60 }),
  createdAt: created(),
}, (t) => ({ bySession: index('metrics_session_idx').on(t.sessionId, t.metricKey) }));

/** Tier C. Version-stamped so trends never silently track model drift. */
export const evaluations = pgTable('evaluations', {
  id: id(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  rubricId: varchar('rubric_id', { length: 60 }).notNull(),
  rubricVersion: integer('rubric_version').notNull(),
  rubricLanguage: varchar('rubric_language', { length: 2 }).notNull(),
  modelId: varchar('model_id', { length: 80 }).notNull(),
  senioritySoundsLike: varchar('seniority_sounds_like', { length: 40 }),
  seniorityWhy: text('seniority_why'),
  seniorityLift: text('seniority_lift'),
  stakeholderPerception: text('stakeholder_perception'),
  retryObjective: text('retry_objective'),
  retryTargetMetricKey: varchar('retry_target_metric_key', { length: 60 }),
  retryTargetDirection: varchar('retry_target_direction', { length: 10 }),
  /** Findings dropped by the verifier. Debug only; never rendered as results. */
  rejected: jsonb('rejected').$type<unknown[]>().default([]),
  timings: jsonb('timings').$type<Record<string, number>>().default({}),
  createdAt: created(),
});

export const findings = pgTable('findings', {
  id: id(),
  evaluationId: uuid('evaluation_id').notNull().references(() => evaluations.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 16 }).notNull(),      // strength | weakness
  dimension: varchar('dimension', { length: 60 }).notNull(),
  severity: varchar('severity', { length: 16 }).notNull(),
  finding: text('finding').notNull(),
  whyItMatters: text('why_it_matters').notNull(),
  recommendedChange: text('recommended_change').notNull(),
  numericReviewFlag: boolean('numeric_review_flag').default(false),
});

export const dimensionAssessments = pgTable('dimension_assessments', {
  id: id(),
  evaluationId: uuid('evaluation_id').notNull().references(() => evaluations.id, { onDelete: 'cascade' }),
  dimension: varchar('dimension', { length: 60 }).notNull(),
  band: varchar('band', { length: 20 }).notNull(),
  rationale: text('rationale'),
});

/** V2 §4 — the perception layer, one row per perception. */
export const mirrorPerceptions = pgTable('mirror_perceptions', {
  id: id(),
  evaluationId: uuid('evaluation_id').notNull().references(() => evaluations.id, { onDelete: 'cascade' }),
  dimension: varchar('dimension', { length: 60 }).notNull(),
  observable: text('observable').notNull(),
  perception: text('perception').notNull(),
});

/**
 * Evidence. A real table with real foreign keys — the reason an unevidenced
 * finding is impossible to persist rather than merely discouraged.
 */
export const evidenceSpans = pgTable('evidence_spans', {
  id: id(),
  findingId: uuid('finding_id').references(() => findings.id, { onDelete: 'cascade' }),
  dimensionAssessmentId: uuid('dimension_assessment_id').references(() => dimensionAssessments.id, { onDelete: 'cascade' }),
  mirrorPerceptionId: uuid('mirror_perception_id').references(() => mirrorPerceptions.id, { onDelete: 'cascade' }),
  observationId: uuid('observation_id'),
  turnId: uuid('turn_id').references(() => turns.id, { onDelete: 'cascade' }),
  quote: text('quote').notNull(),
  startMs: integer('start_ms').notNull(),
  endMs: integer('end_ms').notNull(),
});

// ---------------------------------------------------------------- memory

/** One evolving row per user. (V2 §22) */
export const communicationProfiles = pgTable('communication_profiles', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  sessionsAnalysed: integer('sessions_analysed').notNull().default(0),
  baselineEstablished: boolean('baseline_established').notNull().default(false),
  /** Baseline values keyed by metric_key, computed from the baseline sessions. */
  baselineMetrics: jsonb('baseline_metrics').$type<Record<string, number>>().default({}),
  strongestScenarios: jsonb('strongest_scenarios').$type<string[]>().default([]),
  weakestScenarios: jsonb('weakest_scenarios').$type<string[]>().default([]),
  updatedAt: created(),
});

/**
 * A recurring pattern. Never created from a single session — `observationCount`
 * and `supportingSessionIds` are what make longitudinal language honest.
 * (V2 §22: "Observed repeatedly across 5 sessions", not "You are defensive".)
 */
export const memoryObservations = pgTable('memory_observations', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  dimension: varchar('dimension', { length: 60 }).notNull(),
  description: text('description').notNull(),
  observationCount: integer('observation_count').notNull().default(1),
  firstObserved: timestamp('first_observed', { withTimezone: true }).notNull().defaultNow(),
  lastObserved: timestamp('last_observed', { withTimezone: true }).notNull().defaultNow(),
  confidence: varchar('confidence', { length: 16 }).notNull().default('tentative'),
  supportingSessionIds: jsonb('supporting_session_ids').$type<string[]>().default([]),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  language: varchar('language', { length: 2 }),
}, (t) => ({ byUser: index('memory_user_idx').on(t.userId, t.dimension) }));

export const developmentGoals = pgTable('development_goals', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  metricKey: varchar('metric_key', { length: 60 }),
  dimension: varchar('dimension', { length: 60 }),
  targetValue: real('target_value'),
  baselineValue: real('baseline_value'),
  status: varchar('status', { length: 16 }).notNull().default('open'),
  openedAt: created(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

// ---------------------------------------------------------------- documents

/** Phase 3, but the table exists so ingestion is additive. (V2 §24) */
export const documents = pgTable('documents', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  docType: varchar('doc_type', { length: 30 }).notNull(),
  filename: text('filename').notNull(),
  storageKey: text('storage_key').notNull(),
  extractedText: text('extracted_text'),
  language: varchar('language', { length: 2 }),
  createdAt: created(),
});

// ---------------------------------------------------------------- telemetry

/** Per-turn latency. V2 §37 — instrumented from day one, not retrofitted. */
export const turnLatencies = pgTable('turn_latencies', {
  id: id(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  turnIndex: integer('turn_index').notNull(),
  speechEndMs: integer('speech_end_ms'),
  sttFinalMs: integer('stt_final_ms'),
  llmFirstTokenMs: integer('llm_first_token_ms'),
  ttsFirstAudioMs: integer('tts_first_audio_ms'),
  /** The number that matters: end of user speech → first persona audio. */
  endToFirstAudioMs: integer('end_to_first_audio_ms'),
  createdAt: created(),
});

// ---------------------------------------------------------------- relations

export const sessionRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  event: one(events, { fields: [sessions.eventId], references: [events.id] }),
  turns: many(turns),
  metrics: many(speechMetrics),
  recording: one(recordings),
}));

export const turnRelations = relations(turns, ({ one, many }) => ({
  session: one(sessions, { fields: [turns.sessionId], references: [sessions.id] }),
  words: many(words),
}));

export const evaluationRelations = relations(evaluations, ({ one, many }) => ({
  session: one(sessions, { fields: [evaluations.sessionId], references: [sessions.id] }),
  findings: many(findings),
  dimensions: many(dimensionAssessments),
  mirror: many(mirrorPerceptions),
}));

export const findingRelations = relations(findings, ({ one, many }) => ({
  evaluation: one(evaluations, { fields: [findings.evaluationId], references: [evaluations.id] }),
  evidence: many(evidenceSpans),
}));
