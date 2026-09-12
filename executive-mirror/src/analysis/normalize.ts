/**
 * Text normalisation shared by metric matching and evidence verification.
 *
 * Two rules govern this file:
 *   1. Normalisation is for MATCHING ONLY. Display text and evidence quotes
 *      always retain the speaker's original characters.
 *   2. Arabic and English normalise differently. Applying Latin-oriented
 *      normalisation to Arabic silently breaks filler and hedge matching,
 *      which is the failure mode this module exists to prevent.
 */

export type Lang = 'en' | 'ar';

const TATWEEL = /ـ/g;
// Harakat / tanween / shadda / sukun / superscript alef
const DIACRITICS = /[ً-ْٰٓ-ٕ]/g;
const ALEF_VARIANTS = /[أإآٱ]/g; // أ إ آ ٱ
const YAA_VARIANTS = /[ى]/g;                    // ى
const TAA_MARBUTA = /ة/g;                       // ة
const ARABIC_INDIC = /[٠-٩۰-۹]/g;

const QUOTE_FOLD: Record<string, string> = {
  '‘': "'", '’': "'", '“': '"', '”': '"',
  '،': ',', '؛': ';', '؟': '?', '–': '-', '—': '-',
};

/** Convert Arabic-Indic digits to ASCII so numeric detection works in both scripts. */
export function foldDigits(s: string): string {
  return s.replace(ARABIC_INDIC, (d) => {
    const c = d.codePointAt(0)!;
    const base = c >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(c - base);
  });
}

/**
 * Normalise for matching. Idempotent.
 * Arabic-specific folding is applied unconditionally because Arabic characters
 * simply do not occur in English text — this keeps mixed code-switched turns
 * correct without needing to segment them first.
 */
export function normalize(input: string): string {
  let s = input.normalize('NFKC');
  for (const [from, to] of Object.entries(QUOTE_FOLD)) s = s.split(from).join(to);
  s = foldDigits(s);
  s = s.replace(TATWEEL, '').replace(DIACRITICS, '');
  s = s.replace(ALEF_VARIANTS, 'ا').replace(YAA_VARIANTS, 'ي').replace(TAA_MARBUTA, 'ه');
  s = s.toLowerCase();
  s = s.replace(/[.,!?;:()"']/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Normalise a single token; returns '' for tokens that are pure punctuation. */
export function normalizeToken(t: string): string {
  return normalize(t);
}

const ARABIC_RANGE = /[؀-ۿݐ-ݿ]/;
const LATIN_RANGE = /[A-Za-z]/;

/** Per-token script tag. Used for code-switch detection, never for penalising. */
export function scriptOf(token: string): 'arabic' | 'latin' | 'other' {
  if (ARABIC_RANGE.test(token)) return 'arabic';
  if (LATIN_RANGE.test(token)) return 'latin';
  return 'other';
}

/**
 * Detect the dominant script of a stretch of text.
 * Returns null when neither script clears 60% — genuinely mixed.
 */
export function dominantScript(text: string): 'arabic' | 'latin' | null {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  let ar = 0, la = 0;
  for (const t of tokens) {
    const s = scriptOf(t);
    if (s === 'arabic') ar++;
    else if (s === 'latin') la++;
  }
  const total = ar + la;
  if (total === 0) return null;
  if (ar / total >= 0.6) return 'arabic';
  if (la / total >= 0.6) return 'latin';
  return null;
}
