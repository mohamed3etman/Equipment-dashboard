/**
 * Coaching-quality gate. (Validation Gate 1 §8)
 *
 * "Be more confident" is not coaching. This module encodes the difference
 * between a finding an executive can act on and one they cannot, and runs as a
 * hard gate over real evaluation output — not as a prompt suggestion.
 *
 * Deliberately conservative: it rejects what is unambiguously generic rather
 * than trying to score prose quality. A finding that passes here can still be
 * poor; a finding that fails here is definitely poor.
 */
import type { Finding, Metric } from '@/lib/types';
import { normalize } from '@/analysis/normalize';

/** Phrases that carry no instruction. Matched as whole clauses, not substrings. */
const GENERIC_COACHING = [
  /^be (more|less) \w+\.?$/i,
  /^try to be (more|less )?\w+\.?$/i,
  /^use stronger (communication|language|words)\.?$/i,
  /^(speak|communicate) more (clearly|confidently|concisely)\.?$/i,
  /^improve your (confidence|clarity|presence|communication|delivery)\.?$/i,
  /^work on your \w+\.?$/i,
  /^show more (confidence|conviction|authority)\.?$/i,
  // Written in NORMALISED form: أ→ا, ة→ه, diacritics stripped.
  /^كن اكثر (ثقه|وضوحا|ايجازا|حسما)$/,
  /^حاول ان تكون اكثر \S+$/,
  /^حسن (ثقتك|وضوحك|تواصلك)$/,
];

/**
 * A recommendation must tell the executive what to DO differently.
 *
 * The Arabic alternative deliberately does NOT use \b. JavaScript's word
 * boundary is defined against [A-Za-z0-9_], so it never matches at an Arabic
 * character boundary and the whole alternation would be silently dead — the
 * same defect that once disabled every Arabic trait-language pattern. Anchor
 * on whitespace and Arabic punctuation instead. Matching runs against
 * normalised text so hamza and diacritic variants collapse.
 */
const ACTION_SIGNALS_EN =
  /\b(lead with|open with|start with|state|name|give|cut|replace|move|attach|end with|answer|say|drop|hold back|quantify)\b/i;

const ACTION_SIGNALS_AR =
  /(^|[\s.,!?؛،])(ابدا|اذكر|اعط|احذف|استبدل|اختم|اجب|قل|حدد|ارفق|اخر|قس|انه|اربط|اختصر|قدم)($|[\s.,!?؛،])/u;

function namesAnAction(text: string): boolean {
  if (ACTION_SIGNALS_EN.test(text)) return true;
  return ACTION_SIGNALS_AR.test(normalize(text));
}

export interface QualityIssue {
  kind: 'generic_finding' | 'generic_recommendation' | 'no_action' | 'too_short' | 'no_audience_consequence';
  dimension: string;
  detail: string;
}

/**
 * §8 requires four things of every finding:
 *   what happened, what evidence shows it, why the audience cares,
 *   what to do differently.
 * Evidence is already enforced structurally; this checks the other three.
 */
export function auditFinding(f: Finding): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const normFinding = normalize(f.finding);
  const normRec = normalize(f.recommendedChange);

  for (const p of GENERIC_COACHING) {
    if (p.test(f.finding.trim()) || p.test(normFinding)) {
      issues.push({ kind: 'generic_finding', dimension: f.dimension, detail: `finding is a generic label: "${f.finding}"` });
    }
    if (p.test(f.recommendedChange.trim()) || p.test(normRec)) {
      issues.push({ kind: 'generic_recommendation', dimension: f.dimension, detail: `recommendation is a generic label: "${f.recommendedChange}"` });
    }
  }

  if (!namesAnAction(f.recommendedChange)) {
    issues.push({
      kind: 'no_action', dimension: f.dimension,
      detail: `recommendation names no action the speaker can take: "${f.recommendedChange.slice(0, 70)}"`,
    });
  }

  // "Why it matters" must reference the audience or the consequence, not just
  // restate the finding. A bare restatement teaches nothing.
  // Split by script rather than one mixed alternation: the Arabic branch runs
  // against normalised text so صاحب القرار / اللجنة match regardless of
  // hamza, ta-marbuta or diacritics in the model's output.
  const AUDIENCE_EN = /\b(ceo|board|interviewer|executive|audience|listener|panel|surveyor|investor|hiring|stakeholder|recruiter)\b/i;
  const AUDIENCE_AR = /(الرئيس|المجلس|المحاور|التنفيذي|المستمع|صاحب القرار|اللجنه|المستثمر|جهه التوظيف)/;
  if (!AUDIENCE_EN.test(f.whyItMatters) && !AUDIENCE_AR.test(normalize(f.whyItMatters))) {
    issues.push({
      kind: 'no_audience_consequence', dimension: f.dimension,
      detail: `"why it matters" never names who is affected: "${f.whyItMatters.slice(0, 70)}"`,
    });
  }

  if (f.recommendedChange.trim().length < 25) {
    issues.push({ kind: 'too_short', dimension: f.dimension, detail: `recommendation is ${f.recommendedChange.trim().length} chars` });
  }

  return issues;
}

export interface CoachingAudit {
  findingsChecked: number;
  issues: QualityIssue[];
  /** Findings whose evidence quote is long enough to be a real span, not a word. */
  substantiveEvidence: number;
  passed: boolean;
}

export function auditCoaching(findings: Finding[]): CoachingAudit {
  const issues = findings.flatMap(auditFinding);
  const substantive = findings.filter((f) => f.evidence.some((e) => e.quote.trim().split(/\s+/).length >= 4)).length;
  return {
    findingsChecked: findings.length,
    issues,
    substantiveEvidence: substantive,
    passed: issues.length === 0 && (findings.length === 0 || substantive === findings.length),
  };
}

/**
 * The retry objective is the single most important sentence the product emits.
 * It must be behavioural, specific, and — where possible — bound to a metric
 * that will visibly move.
 */
export function auditRetryObjective(
  statement: string,
  targetMetricKey: string | undefined,
  availableMetrics: Metric[],
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (GENERIC_COACHING.some((p) => p.test(statement.trim()) || p.test(normalize(statement)))) {
    issues.push({ kind: 'generic_recommendation', dimension: 'retryObjective', detail: `generic objective: "${statement}"` });
  }
  if (!namesAnAction(statement)) {
    issues.push({ kind: 'no_action', dimension: 'retryObjective', detail: `objective names no action: "${statement.slice(0, 70)}"` });
  }
  if (targetMetricKey && !availableMetrics.some((m) => m.key === targetMetricKey)) {
    issues.push({
      kind: 'no_action', dimension: 'retryObjective',
      detail: `bound to '${targetMetricKey}', which Pass 0 does not produce — the comparison will report not_measurable`,
    });
  }
  return issues;
}
