/**
 * One formatter for metric values, used by the UI and by the comparison
 * verdict strings, so "18words" can never appear in one place and "18 words"
 * in another.
 */
const NO_SPACE = new Set(['%', ':1', '']);

export function formatMetric(value: number, unit: string): string {
  if (NO_SPACE.has(unit)) return `${value}${unit}`;
  // Short symbolic units read better tight: 150wpm is noisier than 150 wpm,
  // but 26.8 s is worse than 26.8s. Single-char units stay tight.
  if (unit.length === 1) return `${value}${unit}`;
  if (unit.startsWith('/')) return `${value}${unit}`;
  return `${value} ${unit}`;
}
