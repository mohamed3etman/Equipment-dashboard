/**
 * The analysis pipeline. (V2 §16)
 *
 *   Pass 0  deterministic metrics        — no LLM, always runs
 *   Pass 1  content & structure          ┐
 *   Pass 2  executive communication      ├ run in PARALLEL (independent)
 *   Pass 3  scenario / persona reception ┘
 *   Pass 4  Executive Mirror synthesis   — reads 1-3, picks ONE retry objective
 *
 * Every model-produced finding passes through the evidence verifier before it
 * can appear in the result. Rejections are retained for the debug view.
 */
import type { LlmProvider } from '@/providers/types';
import type { SessionConfig } from '@/config/loader';
import type {
  DimensionAssessment, Evaluation, Finding, MirrorPerception, RejectedFinding,
  RetryObjective, SeniorityRead, Transcript,
} from '@/lib/types';
import { computeMetrics, type Pass0Result } from './metrics';
import { anchorQuotes, locateQuote, verifyFindings } from './evidence';
import {
  buildContentPass, buildExecutivePass, buildMirrorPass, buildPersonaPass, type PassContext,
} from './prompts';
import {
  CONTENT_PASS_SCHEMA, EXECUTIVE_PASS_SCHEMA, MIRROR_PASS_SCHEMA, PERSONA_PASS_SCHEMA,
} from './schemas';

export interface AnalyseResult {
  metrics: Pass0Result;
  evaluation: Evaluation;
  timings: Record<string, number>;
}

interface RawPass {
  strengths?: unknown[];
  weaknesses?: unknown[];
  dimensions?: unknown[];
  seniority?: { soundsLike?: string; why?: string; lift?: string; evidence?: unknown };
  stakeholderPerception?: string;
}

interface RawMirror {
  mirror?: Array<{ dimension?: string; observable?: string; perception?: string; evidence?: unknown }>;
  bestMoment?: { quote?: string; analysis?: string } | null;
  weakestMoment?: { quote?: string; analysis?: string } | null;
  retryObjective?: Partial<RetryObjective>;
}

export async function analyseSession(
  transcript: Transcript,
  cfg: SessionConfig,
  llm: LlmProvider,
): Promise<AnalyseResult> {
  const timings: Record<string, number> = {};
  const t0 = Date.now();

  // ---- Pass 0 — deterministic, no LLM ------------------------------------
  const rt = cfg.scenario.response_targets;
  const metrics = computeMetrics(transcript, cfg.lexicon, {
    wordsPerResponse: {
      idealMin: rt.words_per_response.ideal_min,
      idealMax: rt.words_per_response.ideal_max,
      hardMax: rt.words_per_response.hard_max,
    },
    conclusionLatencyWords: {
      idealMax: rt.conclusion_latency_words[cfg.language].ideal_max,
      concernAbove: rt.conclusion_latency_words[cfg.language].concern_above,
    },
    responseDurationSeconds: {
      idealMin: rt.response_duration_seconds.ideal_min,
      idealMax: rt.response_duration_seconds.ideal_max,
    },
  });
  timings.pass0 = Date.now() - t0;

  const ctx: PassContext = { cfg, transcript, metrics: metrics.metrics };
  const verifyOpts = { metricsByKey: metrics.byKey, language: cfg.language };

  const run = async (
    name: string,
    built: { system: string; user: string },
    schema: unknown,
  ): Promise<RawPass> => {
    const start = Date.now();
    try {
      const out = await llm.json<RawPass>({
        system: built.system,
        messages: [{ role: 'user', content: built.user }],
        schemaHint: JSON.stringify(schema),
      });
      timings[name] = Date.now() - start;
      return out;
    } catch (err) {
      timings[name] = Date.now() - start;
      timings[`${name}_failed`] = 1;
      // One failed pass must not lose the whole analysis.
      // eslint-disable-next-line no-console
      console.error(`[analysis] ${name} failed:`, err instanceof Error ? err.message : err);
      return {};
    }
  };

  // ---- Passes 1-3 — parallel ---------------------------------------------
  const tParallel = Date.now();
  const [content, executive, persona] = await Promise.all([
    run('pass1_content', buildContentPass(ctx), CONTENT_PASS_SCHEMA),
    run('pass2_executive', buildExecutivePass(ctx), EXECUTIVE_PASS_SCHEMA),
    run('pass3_persona', buildPersonaPass(ctx), PERSONA_PASS_SCHEMA),
  ]);
  timings.passes_1_3_wall = Date.now() - tParallel;

  const rejected: RejectedFinding[] = [];
  const strengths: Finding[] = [];
  const weaknesses: Finding[] = [];
  const dimensions: DimensionAssessment[] = [];

  for (const pass of [content, executive, persona]) {
    const s = verifyFindings(pass.strengths ?? [], transcript, verifyOpts);
    const w = verifyFindings(pass.weaknesses ?? [], transcript, verifyOpts);
    strengths.push(...s.accepted);
    weaknesses.push(...w.accepted);
    rejected.push(...s.rejected, ...w.rejected);

    for (const d of pass.dimensions ?? []) {
      const dd = d as Partial<DimensionAssessment> & { evidence?: unknown };
      if (!dd.dimension || !dd.band) continue;
      dimensions.push({
        dimension: dd.dimension,
        band: dd.band,
        rationale: dd.rationale ?? '',
        evidence: anchorQuotes(dd.evidence, transcript),
      });
    }
  }

  const seniority: SeniorityRead = {
    soundsLike: executive.seniority?.soundsLike ?? 'not determined',
    why: executive.seniority?.why ?? '',
    lift: executive.seniority?.lift ?? '',
    evidence: anchorQuotes(executive.seniority?.evidence, transcript),
  };

  // ---- Pass 4 — Mirror synthesis ------------------------------------------
  const priorSummary = [
    ...strengths.map((f) => `STRENGTH [${f.dimension}] ${f.finding}`),
    ...weaknesses.map((f) => `WEAKNESS [${f.dimension}] ${f.finding}`),
    ...dimensions.map((d) => `DIMENSION ${d.dimension}: ${d.band}`),
    `SENIORITY: sounds like ${seniority.soundsLike}`,
  ].join('\n');

  const tMirror = Date.now();
  let mirrorRaw: RawMirror = {};
  try {
    mirrorRaw = await llm.json<RawMirror>({
      ...buildMirrorPass(ctx, priorSummary),
      messages: [{ role: 'user', content: buildMirrorPass(ctx, priorSummary).user }],
      schemaHint: JSON.stringify(MIRROR_PASS_SCHEMA),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[analysis] pass4_mirror failed:', err instanceof Error ? err.message : err);
    timings.pass4_failed = 1;
  }
  timings.pass4_mirror = Date.now() - tMirror;

  const mirror: MirrorPerception[] = [];
  for (const m of mirrorRaw.mirror ?? []) {
    if (!m.dimension || !m.perception) continue;
    const evidence = anchorQuotes(m.evidence, transcript);
    // Mirror perceptions are the most consequential claims in the report.
    // No evidence, no perception.
    if (evidence.length === 0) {
      rejected.push({ reason: 'no_evidence', raw: m, detail: `mirror perception '${m.dimension}' had no locatable evidence` });
      continue;
    }
    mirror.push({
      dimension: m.dimension,
      observable: m.observable ?? '',
      perception: m.perception,
      evidence,
    });
  }

  const moment = (m: { quote?: string; analysis?: string } | null | undefined) => {
    if (!m?.quote) return null;
    const span = locateQuote(m.quote, transcript);
    return span ? { span, analysis: m.analysis ?? '' } : null;
  };

  const retryObjective: RetryObjective = mirrorRaw.retryObjective?.statement
    ? {
        id: mirrorRaw.retryObjective.id ?? 'retry-1',
        statement: mirrorRaw.retryObjective.statement,
        targetMetricKey: mirrorRaw.retryObjective.targetMetricKey,
        targetDirection: mirrorRaw.retryObjective.targetDirection,
        targetDimension: mirrorRaw.retryObjective.targetDimension,
      }
    : {
        id: 'retry-fallback',
        statement: cfg.language === 'ar'
          ? 'أعد الإجابة على السؤال نفسه، وابدأ بالخلاصة في الجملة الأولى.'
          : 'Answer the same question again, leading with your conclusion in the first sentence.',
        targetMetricKey: 'conclusion_latency_words',
        targetDirection: 'decrease',
      };

  timings.total = Date.now() - t0;

  return {
    metrics,
    timings,
    evaluation: {
      sessionId: transcript.sessionId,
      language: cfg.language,
      rubricId: cfg.rubric.id,
      rubricVersion: cfg.rubric.version,
      modelId: llm.modelId,
      createdAt: new Date().toISOString(),
      strengths,
      weaknesses,
      dimensions,
      mirror,
      seniority,
      bestMoment: moment(mirrorRaw.bestMoment),
      weakestMoment: moment(mirrorRaw.weakestMoment),
      stakeholderPerception: persona.stakeholderPerception ?? '',
      retryObjective,
      rejected,
    },
  };
}
