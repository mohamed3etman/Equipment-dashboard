import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard against a defect class that has bitten this codebase twice.
 *
 * JavaScript's \b word boundary is defined against [A-Za-z0-9_]. It NEVER
 * matches at an Arabic character boundary, so /\bكلمة\b/ is silently dead — it
 * compiles, it runs, it matches nothing, and no test fails unless one
 * specifically covers Arabic. In a bilingual product that is an entire category
 * of feature quietly not working.
 *
 * Detection is deliberately literal rather than clever: find the two-character
 * sequence \b in the source text, then look at the characters immediately
 * around it for Arabic. Regex-on-regex escaping is exactly how the first
 * version of this guard managed to pass while missing a planted defect.
 */
const ARABIC = /[؀-ۿݐ-ݿ]/;
/**
 * Characters that can sit between \b and the token it guards.
 *
 * `|` is deliberately EXCLUDED. In `/\b(ceo|board)\b|الرئيس/` the Arabic
 * alternative sits after a top-level `|`, which means it is NOT guarded by the
 * \b and works correctly. Treating `|` as a connector flagged that safe
 * pattern as a defect.
 */
const CONNECTORS = new Set(['(', ')', '[', ']', '?', ':', '<', '=', '!', ' ']);

export function findArabicWordBoundaryDefects(source: string): string[] {
  const out: string[] = [];
  const lines = source.split('\n');

  lines.forEach((line, idx) => {
    for (let i = 0; i < line.length - 1; i++) {
      if (line[i] !== '\\' || line[i + 1] !== 'b') continue;
      // An escaped backslash (\\b) is a literal backslash then b — not \b.
      if (i > 0 && line[i - 1] === '\\') continue;

      // Walk right past connectors looking for Arabic.
      let j = i + 2;
      while (j < line.length && CONNECTORS.has(line[j]!)) j++;
      const right = j < line.length && ARABIC.test(line[j]!);

      // Walk left past connectors looking for Arabic.
      let k = i - 1;
      while (k >= 0 && CONNECTORS.has(line[k]!)) k--;
      const left = k >= 0 && ARABIC.test(line[k]!);

      if (left || right) {
        out.push(`line ${idx + 1}: ${line.trim().slice(0, 100)}`);
        break;
      }
    }
  });
  return out;
}

describe('regex safety guard — self test', () => {
  it('detects \\b immediately before an Arabic token', () => {
    expect(findArabicWordBoundaryDefects(String.raw`const P = /\bانت\b/;`)).toHaveLength(1);
  });

  it('detects \\b before an Arabic alternation group', () => {
    expect(findArabicWordBoundaryDefects(String.raw`const P = /\b(انت|دائما)\b/;`)).toHaveLength(1);
  });

  it('detects \\b after an Arabic token', () => {
    expect(findArabicWordBoundaryDefects(String.raw`const P = /(دائما)\b/;`)).toHaveLength(1);
  });

  it('does not flag \\b guarding Latin text', () => {
    expect(findArabicWordBoundaryDefects(String.raw`const P = /\b(hours?|days?)\b/;`)).toHaveLength(0);
  });

  it('does not flag an Arabic pattern anchored the correct way', () => {
    expect(findArabicWordBoundaryDefects(
      String.raw`const P = /(^|[\s.,؛،])(ابدا|اذكر)($|[\s.,؛،])/u;`,
    )).toHaveLength(0);
  });

  it('does not flag an Arabic alternative that follows a top-level pipe', () => {
    // The \b closes the Latin group; الرئيس is a separate, unguarded branch.
    expect(findArabicWordBoundaryDefects(
      String.raw`const a = /\b(ceo|board)\b|الرئيس|المجلس/i;`,
    )).toHaveLength(0);
  });

  it('does not flag a comment that merely mentions Arabic and \\b', () => {
    // This line itself contains both, and must not trip the guard.
    expect(findArabicWordBoundaryDefects(
      '// JavaScript \\b never matches at an Arabic boundary. Use (^|[\\s]) instead.',
    )).toHaveLength(0);
  });
});

describe('regex safety: no \\b guards Arabic anywhere in src/', () => {
  const files = globSync('src/**/*.ts', { cwd: process.cwd() })
    .filter((f) => !f.endsWith('regex-safety.test.ts'));

  it('scans a non-trivial number of source files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('finds no dead Arabic patterns', () => {
    const defects: string[] = [];
    for (const rel of files) {
      for (const hit of findArabicWordBoundaryDefects(readFileSync(join(process.cwd(), rel), 'utf8'))) {
        defects.push(`${rel} ${hit}`);
      }
    }
    expect(
      defects,
      'JavaScript \\b never matches at an Arabic boundary — these patterns are dead. '
      + 'Anchor on (^|[\\s.,!?؛،]) instead.',
    ).toEqual([]);
  });
});
