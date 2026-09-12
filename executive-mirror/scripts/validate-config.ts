/**
 * Validates every config file. Run in CI and before any session.
 * A rubric that half-parses produces coaching that looks fine and is wrong,
 * so this must fail loudly rather than warn.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadEvidenceRules, loadLexicon, loadPersona, loadRubric, loadScenario, loadSessionConfig,
} from '../src/config/loader';
import type { Lang } from '../src/lib/types';

const ROOT = process.env.EM_CONFIG_ROOT ?? join(process.cwd(), 'config');
let failures = 0;
const ok = (m: string) => console.log(`  ok   ${m}`);
const bad = (m: string, e: unknown) => {
  failures++;
  console.error(`  FAIL ${m}\n       ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
};

function idsIn(dir: string, suffix = '.v1.yaml'): string[] {
  const full = join(ROOT, dir);
  try {
    return readdirSync(full)
      .filter((f) => f.endsWith(suffix) && statSync(join(full, f)).isFile())
      .map((f) => f.slice(0, -suffix.length));
  } catch { return []; }
}

console.log('\nValidating Executive Mirror config\n');

console.log('evidence rules');
try { const r = loadEvidenceRules(); ok(`evidence-rules v${r.version} — ${r.rules.length} rules, ${r.bands.length} bands`); }
catch (e) { bad('evidence-rules', e); }

console.log('\nlexicons');
for (const lang of ['en', 'ar'] as Lang[]) {
  try { const l = loadLexicon(lang); ok(`${lang} v${l.version} — ${l.fillers?.single?.length ?? 0} filler tokens`); }
  catch (e) { bad(`lexicon.${lang}`, e); }
}

console.log('\nrubrics');
for (const lang of ['en', 'ar']) {
  for (const id of idsIn(`rubrics/${lang}`)) {
    const ref = `rubrics/${lang}/${id}.v1`;
    try {
      const r = loadRubric(ref);
      ok(`${ref} — ${r.dimensions.length} dimensions, status=${r.status}`);
    } catch (e) { bad(ref, e); }
  }
}

console.log('\nscenarios');
const scenarios = idsIn('scenarios');
for (const id of scenarios) {
  try { const s = loadScenario(id); ok(`${id} v${s.version} — ${s.languages.join('/')}, ${s.challenge_bank.en.length}+${s.challenge_bank.ar.length} challenges`); }
  catch (e) { bad(`scenario.${id}`, e); }
}

console.log('\npersonas');
const personas = idsIn('personas');
for (const id of personas) {
  try { const p = loadPersona(id); ok(`${id} v${p.version} — ${p.pressure_behaviour.triggers.length} pressure triggers`); }
  catch (e) { bad(`persona.${id}`, e); }
}

console.log('\nresolved session configs (cross-references)');
for (const s of scenarios) {
  for (const p of personas) {
    for (const lang of ['en', 'ar'] as Lang[]) {
      try {
        const c = loadSessionConfig(s, p, lang);
        ok(`${s} + ${p} [${lang}] → rubric ${c.rubric.id} v${c.rubric.version}`);
      } catch (e) {
        // Incompatible pairings are a legitimate config state, not a failure.
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not compatible') || msg.includes('does not support')) {
          console.log(`  skip ${s} + ${p} [${lang}] — ${msg.split('\n')[0]}`);
        } else { bad(`${s}+${p}[${lang}]`, e); }
      }
    }
  }
}

console.log(failures === 0 ? '\nAll config valid.\n' : `\n${failures} config failure(s).\n`);
process.exit(failures === 0 ? 0 : 1);
