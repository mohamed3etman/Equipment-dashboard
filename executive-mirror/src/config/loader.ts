import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  EvidenceRulesSchema, LexiconSchema, PersonaSchema, RubricSchema, ScenarioSchema,
  type EvidenceRules, type Lexicon, type Persona, type Rubric, type Scenario,
} from './schema';
import type { Lang } from '@/lib/types';

const CONFIG_ROOT = process.env.EM_CONFIG_ROOT ?? join(process.cwd(), 'config');

const cache = new Map<string, unknown>();

function loadYaml(relPath: string): unknown {
  const full = join(CONFIG_ROOT, relPath);
  if (!existsSync(full)) throw new Error(`Config not found: ${relPath} (looked in ${CONFIG_ROOT})`);
  const cached = cache.get(full);
  if (cached !== undefined && process.env.NODE_ENV === 'production') return cached;
  const parsed = parseYaml(readFileSync(full, 'utf8'));
  cache.set(full, parsed);
  return parsed;
}

function validate<T>(schema: { safeParse: (u: unknown) => { success: boolean; data?: T; error?: unknown } }, raw: unknown, what: string): T {
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw new Error(`Invalid config for ${what}:\n${JSON.stringify(r.error, null, 2).slice(0, 3000)}`);
  }
  return r.data as T;
}

export function loadLexicon(lang: Lang): Lexicon {
  return validate<Lexicon>(LexiconSchema, loadYaml(`lexicons/${lang}.v1.yaml`), `lexicon.${lang}`);
}

export function loadEvidenceRules(): EvidenceRules {
  return validate<EvidenceRules>(EvidenceRulesSchema, loadYaml('rubrics/shared/evidence-rules.v1.yaml'), 'evidence-rules');
}

/** `ref` is a versionless-suffixed path like `rubrics/en/executive.v1`. */
export function loadRubric(ref: string): Rubric {
  return validate<Rubric>(RubricSchema, loadYaml(`${ref}.yaml`), ref);
}

export function loadScenario(id: string, version = 1): Scenario {
  return validate<Scenario>(ScenarioSchema, loadYaml(`scenarios/${id}.v${version}.yaml`), `scenario.${id}`);
}

export function loadPersona(id: string, version = 1): Persona {
  return validate<Persona>(PersonaSchema, loadYaml(`personas/${id}.v${version}.yaml`), `persona.${id}`);
}

/** Everything one session needs, resolved and validated together. */
export interface SessionConfig {
  scenario: Scenario;
  persona: Persona;
  rubric: Rubric;
  lexicon: Lexicon;
  evidenceRules: EvidenceRules;
  language: Lang;
}

export function loadSessionConfig(scenarioId: string, personaId: string, language: Lang): SessionConfig {
  const scenario = loadScenario(scenarioId);
  const persona = loadPersona(personaId);

  if (!scenario.languages.includes(language)) {
    throw new Error(`Scenario ${scenarioId} does not support language '${language}'`);
  }
  if (!persona.languages.includes(language)) {
    throw new Error(`Persona ${personaId} does not support language '${language}'`);
  }
  if (!persona.compatible_scenarios.includes(scenarioId)) {
    throw new Error(`Persona ${personaId} is not compatible with scenario ${scenarioId}`);
  }

  return {
    scenario,
    persona,
    rubric: loadRubric(scenario.rubric[language]),
    lexicon: loadLexicon(language),
    evidenceRules: loadEvidenceRules(),
    language,
  };
}
