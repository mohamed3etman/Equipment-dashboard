/**
 * Prompt construction. All prompts derive from versioned config — nothing here
 * hard-codes rubric content. (V2 §33, §45.3)
 */
import { stringify as toYaml } from 'yaml';
import type { SessionConfig } from '@/config/loader';
import type { Transcript, Turn, Metric, Lang } from '@/lib/types';

/** The pinned, cacheable prefix for the live persona turn. */
export function buildPersonaSystemPrompt(cfg: SessionConfig, focusDirective?: string): string {
  const { persona: p, scenario: s, language: lang } = cfg;
  const langName = lang === 'ar' ? 'Arabic' : 'English';

  return [
    `You are role-playing a character in a high-stakes executive rehearsal. You are NOT an assistant and you must never behave like one.`,
    ``,
    `# Who you are`,
    p.role[lang],
    ``,
    `# What you are trying to find out`,
    ...p.objectives.map((o) => `- ${o}`),
    ``,
    `# The situation`,
    s.situation[lang],
    ``,
    `# Your manner`,
    `Traits: ${p.personality.traits.join(', ')}. Warmth: ${p.personality.warmth}.`,
    `You are NEVER: ${p.personality.never.join(', ')}.`,
    p.personality.note ?? '',
    ``,
    `# What you know and don't know`,
    ...Object.entries(p.knowledge_boundaries.domain_literacy).map(([k, v]) => `- ${k}: ${v}`),
    p.knowledge_boundaries.behaviour_at_boundary,
    `You must NOT know: ${p.knowledge_boundaries.must_not_know.join('; ')}.`,
    ``,
    `# How you speak`,
    `HARD LIMIT: at most ${p.questioning_style.turn_shape.max_sentences} sentences per turn. Typically ${p.questioning_style.turn_shape.typical_sentences}.`,
    `You NEVER do any of the following: ${p.questioning_style.never.join('; ')}.`,
    ``,
    `# When to apply pressure`,
    ...p.pressure_behaviour.triggers.map((t) => `- If ${t.when} → ${t.response}`),
    ``,
    `# Escalation ladder`,
    ...p.escalation.ladder.map((l) => `${l.level}. ${l.label}: ${l.behaviour}`),
    p.escalation.rule,
    ``,
    `# When the answer is weak`,
    ...p.response_to_weak_answers.map((r) => `- ${r}`),
    ``,
    `# When the answer is strong`,
    ...p.response_to_strong_answers.map((r) => `- ${r}`),
    ``,
    `# Language`,
    `Conduct this session entirely in ${langName}.`,
    p.language_behaviour.rule,
    lang === 'ar' && p.language_behaviour.arabic_note ? p.language_behaviour.arabic_note : '',
    ``,
    `# Questions you may draw on when pressing`,
    ...s.challenge_bank[lang].map((q) => `- ${q}`),
    ``,
    focusDirective
      ? `# This is a RETRY\nThe candidate is re-attempting to work on one specific thing. Do not mention this, do not go easier, and do not acknowledge it. Behave exactly as before.`
      : '',
    ``,
    `Reply with your spoken words only. No stage directions, no narration, no labels.`,
  ].filter(Boolean).join('\n');
}

/** Render only the user's turns, numbered, for the analysis passes. */
function renderUserTurns(t: Transcript): string {
  return t.turns
    .filter((x) => x.speaker === 'user')
    .map((x) => `[user turn ${x.index}] ${x.text}`)
    .join('\n\n');
}

/** Render the full exchange so the evaluator can see what was asked. */
function renderExchange(t: Transcript): string {
  return t.turns
    .map((x) => `[${x.speaker} turn ${x.index}${x.isChallenge ? ' — CHALLENGE' : ''}] ${x.text}`)
    .join('\n\n');
}

function renderMetrics(metrics: Metric[]): string {
  return metrics
    .map((m) => `- ${m.key}: ${m.value}${m.unit} (${m.tier})`)
    .join('\n');
}

/** Rules every analysis pass shares. Kept in one place so they cannot drift. */
function evidenceContract(lang: Lang): string {
  return [
    `# Evidence contract — non-negotiable`,
    `1. Every finding MUST include at least one \`evidence\` entry whose \`quote\` is copied VERBATIM from a [user turn ...] block above. Not paraphrased. Not from a persona turn.`,
    `2. A quote that does not appear verbatim in a user turn will be automatically DROPPED along with its finding. Copy exactly, including any disfluency.`,
    `3. Every finding MUST have all four parts: finding, evidence, whyItMatters, recommendedChange.`,
    `4. Describe THIS RESPONSE, never the person. Write "this answer opened with three qualifiers", never "you are hesitant". Trait claims are rejected automatically.`,
    `5. Do NOT state any numeric metric of your own. You may reference the metrics supplied above by name. Invented numbers are flagged.`,
    `6. Never produce an overall score, a 0–100 rating, or a decimal. Bands only: strong, effective, developing, needs_attention, critical.`,
    lang === 'ar'
      ? `7. Write all prose in Arabic. Quote Arabic evidence exactly as it appears, including diacritics if present.`
      : `7. Write all prose in English.`,
  ].join('\n');
}

function rubricBlock(cfg: SessionConfig, pass: 'content' | 'executive' | 'persona'): string {
  const dims = cfg.rubric.dimensions.filter((d) => d.pass === pass);
  return toYaml({ dimensions: dims }, { lineWidth: 0 });
}

export interface PassContext {
  cfg: SessionConfig;
  transcript: Transcript;
  metrics: Metric[];
}

export function buildContentPass(ctx: PassContext): { system: string; user: string } {
  const { cfg, transcript, metrics } = ctx;
  return {
    system: [
      `You evaluate the CONTENT and STRUCTURE of an executive's spoken answers against a fixed rubric.`,
      `You are not the interviewer. You are an independent evaluator who did not take part in the conversation.`,
      ``,
      `# Rubric dimensions for this pass`,
      rubricBlock(cfg, 'content'),
      ``,
      cfg.scenario.answer_framework_expected && cfg.rubric.answer_framework
        ? `# ANSWER framework\n${toYaml(cfg.rubric.answer_framework, { lineWidth: 0 })}`
        : '',
      evidenceContract(cfg.language),
    ].filter(Boolean).join('\n'),
    user: [
      `# Scenario`, cfg.scenario.situation[cfg.language],
      ``, `# Audience`, cfg.scenario.audience[cfg.language],
      ``, `# Deterministic metrics already computed (do not restate as your own)`, renderMetrics(metrics),
      ``, `# The exchange`, renderExchange(transcript),
      ``, `Evaluate the user's answers on the content dimensions. Return JSON.`,
    ].join('\n'),
  };
}

export function buildExecutivePass(ctx: PassContext): { system: string; user: string } {
  const { cfg, transcript, metrics } = ctx;
  return {
    system: [
      `You evaluate EXECUTIVE COMMUNICATION — framing, compression, presence under pressure, decision orientation.`,
      `You are an independent evaluator, not the interviewer.`,
      ``,
      `# Rubric dimensions for this pass`,
      rubricBlock(cfg, 'executive'),
      ``,
      `# Seniority read`,
      `The scenario expects the level: ${cfg.scenario.target_seniority}.`,
      toYaml(cfg.rubric.seniority, { lineWidth: 0 }),
      `Report seniority as three fields — soundsLike, why, lift. NEVER as a score or band on its own.`,
      ``,
      evidenceContract(cfg.language),
    ].join('\n'),
    user: [
      `# Scenario`, cfg.scenario.situation[cfg.language],
      ``, `# Deterministic metrics (reference by name; do not invent numbers)`, renderMetrics(metrics),
      ``, `# The exchange`, renderExchange(transcript),
      ``,
      `Turns marked CHALLENGE are where the interviewer pushed back. For any dimension marked segmented, compare the user's behaviour BEFORE the first challenge with AFTER it.`,
      ``, `Return JSON.`,
    ].join('\n'),
  };
}

export function buildPersonaPass(ctx: PassContext): { system: string; user: string } {
  const { cfg, transcript } = ctx;
  return {
    system: [
      `You judge how the SPECIFIC stakeholder in this scenario would have received these answers.`,
      `You are not that stakeholder and you are not the interviewer — you are assessing how they would have reacted.`,
      ``,
      `# Who they are`, cfg.persona.role[cfg.language],
      ``, `# What they are trying to find out`, ...cfg.persona.objectives.map((o) => `- ${o}`),
      ``, `# What builds their confidence`, ...cfg.persona.confidence_model.gains_confidence_when.map((o) => `- ${o}`),
      ``, `# What erodes it`, ...cfg.persona.confidence_model.loses_confidence_when.map((o) => `- ${o}`),
      ``, `# Their domain literacy (detail beyond this is a problem)`,
      ...Object.entries(cfg.persona.knowledge_boundaries.domain_literacy).map(([k, v]) => `- ${k}: ${v}`),
      ``, `# Rubric dimensions for this pass`, rubricBlock(cfg, 'persona'),
      ``, evidenceContract(cfg.language),
    ].join('\n'),
    user: [
      `# The exchange`, renderExchange(transcript),
      ``,
      `Assess how this stakeholder would have received these answers, and state what they would plausibly conclude. Return JSON.`,
    ].join('\n'),
  };
}

export function buildMirrorPass(ctx: PassContext, priorFindings: string): { system: string; user: string } {
  const { cfg, transcript, metrics } = ctx;
  const em = cfg.rubric.executive_mirror;
  return {
    system: [
      `You produce the EXECUTIVE MIRROR — the perception layer.`,
      `Frame: "${em.frame}"`,
      ``,
      `# Perception dimensions`, ...em.dimensions.map((d) => `- ${d}`),
      ``, `# Output rule`, em.output_rule,
      (em as { cultural_calibration?: string }).cultural_calibration
        ? `\n# Cultural calibration\n${(em as { cultural_calibration?: string }).cultural_calibration}` : '',
      ``,
      `# Your single most important job`,
      `Select exactly ONE retry objective: the single change that would most improve how this person is received.`,
      `It must be behavioural, specific, and achievable in one re-attempt.`,
      `Good: "Answer the budget-cut question in under 40 seconds and name what you would stop."`,
      `Bad: "Be more confident." / "Improve your executive presence."`,
      `Where possible, bind it to one deterministic metric that will visibly move.`,
      ``,
      `You are ALLOWED and ENCOURAGED to report that nothing new emerged this session if that is the honest read.`,
      ``,
      evidenceContract(cfg.language),
    ].filter(Boolean).join('\n'),
    user: [
      `# Deterministic metrics`, renderMetrics(metrics),
      ``, `# Findings from earlier passes`, priorFindings,
      ``, `# The user's own words`, renderUserTurns(transcript),
      ``,
      `Available metric keys for targetMetricKey: ${metrics.map((m) => m.key).join(', ')}`,
      ``, `Return JSON.`,
    ].join('\n'),
  };
}

/** Compact per-turn reminder re-injected to counter persona drift. (V2 §6.5) */
export function personaDriftReminder(cfg: SessionConfig): string {
  const p = cfg.persona;
  return `Reminder: you are ${p.label_en}. At most ${p.questioning_style.turn_shape.max_sentences} sentences. Never praise, never coach, never summarise their answer back to them.`;
}

export function pickOpeningQuestion(cfg: SessionConfig, pinnedId?: string): { id: string; text: string } {
  const pool = cfg.scenario.opening_questions[cfg.language];
  if (pinnedId) {
    const found = pool.find((q) => q.id === pinnedId);
    if (found) return found;
  }
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return chosen ?? pool[0]!;
}

/** Detect whether a persona turn came from the challenge bank. */
export function isChallengeTurn(text: string, cfg: SessionConfig): boolean {
  const bank = cfg.scenario.challenge_bank[cfg.language];
  const t = text.toLowerCase();
  return bank.some((q) => {
    const key = q.toLowerCase().slice(0, 24);
    return key.length > 8 && t.includes(key);
  });
}
