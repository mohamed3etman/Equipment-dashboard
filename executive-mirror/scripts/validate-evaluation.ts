/**
 * EVALUATION QUALITY VALIDATION. (Validation Gate 1 §6, §7, §8)
 *
 * Runs the failure-mode corpus through the REAL analysis pipeline and asks
 * three questions the deterministic layer cannot answer:
 *
 *   1. Does the evaluation distinguish the seven failure modes by FUNCTION?
 *   2. Does every finding clear the §8 coaching bar?
 *   3. Does the retry loop detect real improvement on three weaknesses?
 *
 *   ANTHROPIC_API_KEY=... npx tsx scripts/validate-evaluation.ts
 *
 * Without a key this reports UNVALIDATED and exits. It never substitutes mock
 * output for a real result.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadSessionConfig } from '../src/config/loader';
import { analyseSession } from '../src/analysis/pipeline';
import { compareAttempts } from '../src/analysis/compare';
import { auditCoaching, auditRetryObjective } from '../src/validation/coaching-quality';
import { SAMPLES, type FailureMode } from '../src/validation/failure-modes';
import { metricsFor, transcriptFor } from '../src/validation/run-corpus';
import type { Sample } from '../src/validation/failure-modes';

const OUT = join(process.cwd(), '.validation');

/**
 * Which rubric dimension SHOULD fire for each failure mode. The evaluation is
 * correct when it names the right failure, not merely when it says something.
 */
const EXPECTED_DIMENSION: Record<FailureMode, string[]> = {
  excessive_apology: ['hedging_control', 'courtesy_vs_hedging', 'ownership'],
  over_explanation: ['compression', 'technical_detail_control'],
  weak_conclusion: ['decision_orientation', 'conclusion_positioning', 'conclusion_positioning_ar'],
  no_quantified_impact: ['evidence_and_quantification'],
  technical_without_business: ['technical_detail_control', 'strategic_framing'],
  defensive_under_challenge: ['pressure_integrity', 'pressure_integrity_ar', 'hedging_control'],
  strong_executive: [],
};

/** Retry pairs: a weak sample and the strong answer to the same question. */
const RETRY_PAIRS: Array<{ label: string; weak: FailureMode; lang: 'en' | 'ar' }> = [
  { label: 'over-explanation → concise', weak: 'over_explanation', lang: 'en' },
  { label: 'no quantification → evidenced', weak: 'no_quantified_impact', lang: 'en' },
  { label: 'defensive → holds position (AR)', weak: 'defensive_under_challenge', lang: 'ar' },
];

async function main() {
  console.log('\nEXECUTIVE MIRROR — EVALUATION QUALITY VALIDATION');
  console.log('='.repeat(92));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\nUNVALIDATED — REAL PROVIDER TEST PENDING');
    console.log('ANTHROPIC_API_KEY is not set. Passes 1-4 cannot execute, so none of');
    console.log('the following can be assessed:');
    console.log('  - whether the seven failure modes are distinguished by function');
    console.log('  - whether findings clear the §8 coaching bar');
    console.log('  - whether Executive Mirror perceptions are evidence-backed in practice');
    console.log('  - whether the retry loop recognises real improvement');
    console.log('\nDeterministic discrimination IS validated — run: npx vitest run src/validation');
    console.log('='.repeat(92) + '\n');
    process.exit(2);
  }

  mkdirSync(OUT, { recursive: true });
  const { AnthropicLlmProvider } = await import('../src/providers/llm/anthropic');
  const llm = new AnthropicLlmProvider(process.env.ANTHROPIC_API_KEY, { effort: 'high' });

  const rows: Array<Record<string, unknown>> = [];
  let failures = 0;

  // ---------------------------------------------------------------- §6
  console.log('\n§6  FAILURE-MODE DISCRIMINATION (real evaluation)\n');
  const analysed = new Map<string, Awaited<ReturnType<typeof analyseSession>>>();

  for (const s of SAMPLES) {
    const cfg = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', s.language);
    const t = transcriptFor(s);
    const r = await analyseSession(t, cfg, llm);
    analysed.set(`${s.mode}:${s.condition}`, r);

    const named = new Set([
      ...r.evaluation.weaknesses.map((w) => w.dimension),
      ...r.evaluation.dimensions.filter((d) => ['critical', 'needs_attention', 'developing'].includes(d.band)).map((d) => d.dimension),
    ]);
    const expected = EXPECTED_DIMENSION[s.mode];
    const hit = expected.length === 0
      ? r.evaluation.weaknesses.length === 0
      : expected.some((d) => named.has(d));

    if (!hit) failures++;
    console.log(
      `  ${hit ? 'ok  ' : 'FAIL'} ${s.mode.padEnd(28)} [${s.condition.padEnd(5)}] ` +
      `named: ${[...named].slice(0, 3).join(', ') || '(none)'}${expected.length ? `  expected one of: ${expected.join('|')}` : '  expected: no weaknesses'}`,
    );
    rows.push({ check: 'discrimination', mode: s.mode, condition: s.condition, hit, named: [...named] });
  }

  // ---------------------------------------------------------------- §8
  console.log('\n§8  COACHING QUALITY BAR\n');
  for (const [key, r] of analysed) {
    const all = [...r.evaluation.weaknesses, ...r.evaluation.strengths];
    const audit = auditCoaching(all);
    const objIssues = auditRetryObjective(
      r.evaluation.retryObjective.statement,
      r.evaluation.retryObjective.targetMetricKey,
      r.metrics.metrics,
    );
    const ok = audit.passed && objIssues.length === 0;
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(40)} ${audit.findingsChecked} findings, ${audit.issues.length + objIssues.length} quality issues`);
    for (const i of [...audit.issues, ...objIssues].slice(0, 3)) console.log(`         · [${i.kind}] ${i.detail.slice(0, 100)}`);
    rows.push({ check: 'coaching_quality', key, ok, issues: [...audit.issues, ...objIssues] });
  }

  // ---------------------------------------------------------------- §5
  console.log('\n§5  EXECUTIVE MIRROR — every perception evidence-backed\n');
  for (const [key, r] of analysed) {
    const unevidenced = r.evaluation.mirror.filter((m) => m.evidence.length === 0);
    const ok = unevidenced.length === 0 && r.evaluation.mirror.length > 0;
    if (!ok && r.evaluation.mirror.length === 0) {
      console.log(`  ---- ${key.padEnd(40)} no perceptions produced`);
    } else {
      if (!ok) failures++;
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(40)} ${r.evaluation.mirror.length} perceptions, ${r.evaluation.rejected.length} rejected pre-display`);
    }
    rows.push({ check: 'mirror', key, perceptions: r.evaluation.mirror.length, rejected: r.evaluation.rejected.length });
  }

  // ---------------------------------------------------------------- §7
  console.log('\n§7  RETRY LOOP — does the targeted behaviour actually improve?\n');
  for (const pair of RETRY_PAIRS) {
    const weak = SAMPLES.find((s) => s.mode === pair.weak && s.language === pair.lang);
    const strong = SAMPLES.find((s) => s.mode === 'strong_executive' && s.language === pair.lang);
    if (!weak || !strong) { console.log(`  ---- ${pair.label}: corpus pair missing`); continue; }

    const before = analysed.get(`${weak.mode}:${weak.condition}`)!;
    const after = analysed.get(`strong_executive:${strong.condition}`)!;
    const cmp = compareAttempts(before, after, before.evaluation.retryObjective);

    const ok = cmp.targetOutcome.verdict === 'achieved' || cmp.targetOutcome.verdict === 'partial';
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${pair.label.padEnd(34)} verdict=${cmp.targetOutcome.verdict}`);
    console.log(`         objective: ${before.evaluation.retryObjective.statement.slice(0, 90)}`);
    console.log(`         ${cmp.targetOutcome.explanation.slice(0, 100)}`);
    console.log(`         improved ${cmp.improved.length}, regressed ${cmp.regressed.length}, resolved [${cmp.resolvedWeaknesses.join(', ')}]`);
    rows.push({ check: 'retry', label: pair.label, verdict: cmp.targetOutcome.verdict, improved: cmp.improved.length });
  }

  console.log('\n' + '='.repeat(92));
  console.log(failures === 0 ? 'ALL EVALUATION CHECKS PASSED' : `${failures} EVALUATION CHECK(S) FAILED`);
  console.log('='.repeat(92) + '\n');
  writeFileSync(join(OUT, 'evaluation-validation.json'), JSON.stringify({ ranAt: new Date().toISOString(), failures, rows }, null, 2));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
