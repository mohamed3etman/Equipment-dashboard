'use client';
import type { ReactNode } from 'react';
import type { Band } from '@/lib/types';

/** Band presentation. Five bands, no numbers, no composite. (V2 §15) */
const BAND_STYLE: Record<Band, { label: string; labelAr: string; cls: string }> = {
  strong:          { label: 'Strong',          labelAr: 'قوي',          cls: 'text-positive border-positive/40 bg-positive/5' },
  effective:       { label: 'Effective',       labelAr: 'فعّال',        cls: 'text-positive/85 border-positive/25 bg-positive/5' },
  developing:      { label: 'Developing',      labelAr: 'قيد التطوير',  cls: 'text-caution border-caution/35 bg-caution/5' },
  needs_attention: { label: 'Needs Attention', labelAr: 'يحتاج انتباه', cls: 'text-caution border-caution/50 bg-caution/10' },
  critical:        { label: 'Critical',        labelAr: 'حرج',          cls: 'text-critical border-critical/45 bg-critical/10' },
};

export function BandChip({ band, ar = false }: { band: Band; ar?: boolean }) {
  const s = BAND_STYLE[band];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {ar ? s.labelAr : s.label}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-raised ${className}`}>{children}</div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">{children}</h2>
      {hint ? <span className="text-xs text-faint">{hint}</span> : null}
    </div>
  );
}

/**
 * Evidence quote. Every AI-inferred claim in this product must be able to show
 * the words it is based on, with a timestamp. (V2 §14)
 */
export function Evidence({
  quote, startMs, onPlay,
}: { quote: string; startMs: number; onPlay?: (ms: number) => void }) {
  const t = `${Math.floor(startMs / 60000)}:${String(Math.floor((startMs % 60000) / 1000)).padStart(2, '0')}`;
  return (
    <button
      type="button"
      onClick={() => onPlay?.(startMs)}
      className="group mt-2 flex w-full gap-3 rounded-lg border border-line/70 bg-surface px-3 py-2 text-start transition-colors hover:border-accent/40"
    >
      <span className="nums shrink-0 pt-0.5 font-mono text-[11px] text-faint group-hover:text-accent">{t}</span>
      <span className="text-sm italic leading-relaxed text-muted">“{quote}”</span>
    </button>
  );
}

/**
 * A metric row. `tier` is rendered explicitly so objective measurement is never
 * visually confused with AI inference. (V2 §12)
 */
export function MetricRow({
  label, value, unit, tier, ruleVersion, target,
}: {
  label: string; value: number; unit: string;
  tier: 'objective' | 'semi_objective';
  ruleVersion?: string;
  target?: { idealMin?: number; idealMax?: number; concernAbove?: number };
}) {
  let flag: 'ok' | 'over' | 'under' | null = null;
  if (target) {
    if (target.concernAbove !== undefined && value > target.concernAbove) flag = 'over';
    else if (target.idealMax !== undefined && value > target.idealMax) flag = 'over';
    else if (target.idealMin !== undefined && value < target.idealMin) flag = 'under';
    else flag = 'ok';
  }
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 last:border-0">
      <div className="min-w-0">
        <div className="truncate text-sm text-ink">{label}</div>
        {tier === 'semi_objective' && ruleVersion ? (
          <div className="mt-0.5 font-mono text-[10px] text-faint">rule: {ruleVersion}</div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-baseline gap-1.5">
        <span className={`nums text-sm font-medium ${
          flag === 'over' ? 'text-caution' : flag === 'under' ? 'text-caution' : 'text-ink'
        }`}>{value}</span>
        <span className="text-xs text-faint">{unit}</span>
      </div>
    </div>
  );
}

/**
 * Tier explanation. Copy is passed in from config (config/labels.v1.yaml) so
 * Arabic sessions never fall back to English prose inside an RTL layout.
 */
export function TierNote({ text }: { text: string }) {
  return <p className="mb-3 max-w-readable text-xs leading-relaxed text-faint">{text}</p>;
}

export function Button({
  children, onClick, variant = 'secondary', href, disabled, className = '',
}: {
  children: ReactNode; onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  href?: string; disabled?: boolean; className?: string;
}) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none';
  const styles = {
    primary: 'bg-accent text-raised hover:opacity-90 dark:text-surface',
    secondary: 'border border-line bg-raised text-ink hover:border-accent/40',
    ghost: 'text-muted hover:text-ink',
  }[variant];
  const cls = `${base} ${styles} ${className}`;
  if (href) return <a href={href} className={cls}>{children}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{children}</button>;
}
