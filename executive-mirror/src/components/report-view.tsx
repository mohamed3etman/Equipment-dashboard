'use client';
import { useState } from 'react';
import type { DemoRun, LabelMaps } from '@/lib/demo-session';
import type { Band, Finding, Metric } from '@/lib/types';
import { BandChip, Button, Card, Evidence, MetricRow, SectionTitle, TierNote } from './ui';
import { formatMetric } from '@/lib/format';

type Attempt = 1 | 2;

export function ReportView({ run, labels }: { run: DemoRun; labels: LabelMaps }) {
  const L = (id: string) => labels.dimensions[id] ?? id.replace(/_/g, ' ');
  const S = (id: string) => labels.seniority[id] ?? id.replace(/_/g, ' ');
  const [attempt, setAttempt] = useState<Attempt>(1);
  const [showCompare, setShowCompare] = useState(false);
  const [showRejected, setShowRejected] = useState(false);

  const ar = run.language === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const hasRetry = Boolean(run.attempt2 && run.comparison);
  const a = attempt === 2 && run.attempt2 ? run.attempt2 : run.attempt1;
  const { evaluation: ev, metrics } = a.result;

  const objective = metrics.metrics.filter((m) => m.tier === 'objective');
  const semi = metrics.metrics.filter((m) => m.tier === 'semi_objective');

  const t = (en: string, arabic: string) => (ar ? arabic : en);

  return (
    <div dir={dir} className="mx-auto max-w-5xl px-5 py-10 md:px-8">

      {/* ---- header ---- */}
      <header className="mb-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-faint">
          <span className="font-medium uppercase tracking-[0.14em]">Executive Mirror</span>
          <span>·</span><span>{run.scenarioLabel}</span>
          <span>·</span><span>{run.personaLabel}</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          {t('Session report', 'تقرير الجلسة')}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {hasRetry && ([1, 2] as Attempt[]).map((n) => (
            <button
              key={n}
              onClick={() => setAttempt(n)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                attempt === n ? 'border-accent/50 bg-accent/10 text-ink' : 'border-line text-muted hover:text-ink'
              }`}
            >
              {t(`Attempt ${n}`, `المحاولة ${n === 1 ? '١' : '٢'}`)}
            </button>
          ))}
          {hasRetry ? (
            <button
              onClick={() => setShowCompare((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                showCompare ? 'border-accent/50 bg-accent/10 text-ink' : 'border-line text-muted hover:text-ink'
              }`}
            >
              {t('Compare', 'المقارنة')}
            </button>
          ) : null}
        </div>
      </header>

      {showCompare && run.comparison && run.attempt2
        ? <Comparison run={run} comparison={run.comparison} attempt2={run.attempt2} ar={ar} L={L} S={S} />
        : null}

      {/* ---- THE ONE THING (above the fold, primary CTA) ---- */}
      {!showCompare && (
        <Card className="mb-8 overflow-hidden border-accent/30">
          <div className="border-b border-line bg-accent/[0.04] px-5 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              {t('The one thing to change', 'الشيء الوحيد الذي يجب تغييره')}
            </div>
          </div>
          <div className="px-5 py-5">
            <p className="max-w-readable text-lg leading-relaxed text-ink">{ev.retryObjective.statement}</p>
            {ev.retryObjective.targetMetricKey ? (
              <p className="mt-3 font-mono text-[11px] text-faint">
                {t('measured by', 'يُقاس بـ')} {ev.retryObjective.targetMetricKey} ({ev.retryObjective.targetDirection})
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {run.sessionId && !hasRetry ? (
                // Real session, not yet retried: go and actually do it again.
                <Button
                  variant="primary"
                  href={`/session?retryOf=${run.sessionId}&lang=${run.language}`}
                >
                  {t('Try again with this focus', 'أعد المحاولة بهذا التركيز')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => { setAttempt(2); setShowCompare(false); }}
                  disabled={!hasRetry}
                >
                  {t('Try again with this focus', 'أعد المحاولة بهذا التركيز')}
                </Button>
              )}
              {hasRetry ? (
                <Button variant="secondary" onClick={() => setShowCompare(true)}>
                  {t('See what changed', 'ماذا تغيّر')}
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      )}

      {!showCompare && (
        <>
          {/* ---- Executive Mirror ---- */}
          <section className="mb-10">
            <SectionTitle hint={t('AI-inferred · evidence-backed', 'استنتاج ذكاء اصطناعي · مسنَد بالدليل')}>
              {t('Executive Mirror', 'المرآة التنفيذية')}
            </SectionTitle>
            <p className="mb-4 max-w-readable text-sm italic leading-relaxed text-muted">
              {t(
                '“If I were sitting across the table from you, this is how I would perceive you.”',
                '«لو كنت جالساً أمامك على الطاولة، هذا هو الانطباع الذي سأخرج به.»',
              )}
            </p>
            <TierNote text={labels.tierNotes.inferred} />
            <div className="grid gap-3 md:grid-cols-2">
              {ev.mirror.map((m, i) => (
                <Card key={i} className="p-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
                    {L(m.dimension)}
                  </div>
                  <p className="text-sm leading-relaxed text-muted">
                    <span className="text-faint">{t('What you did:', 'ما فعلته:')} </span>{m.observable}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ink">
                    <span className="text-faint">{t('How it reads:', 'كيف يُقرأ:')} </span>{m.perception}
                  </p>
                  {m.evidence.map((e, j) => <Evidence key={j} quote={e.quote} startMs={e.startMs} />)}
                </Card>
              ))}
            </div>
          </section>

          {/* ---- Seniority ---- */}
          <section className="mb-10">
            <SectionTitle>{t('Seniority read', 'قراءة المستوى القيادي')}</SectionTitle>
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-faint">{t('Sounds like', 'يبدو كمستوى')}</span>
                <span className="rounded-md border border-line bg-surface px-2 py-0.5 font-medium text-ink">
                  {S(ev.seniority.soundsLike)}
                </span>
              </div>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-faint">{t('Why', 'لماذا')}</dt>
                  <dd className="mt-1 max-w-readable leading-relaxed text-muted">{ev.seniority.why}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-faint">{t('What lifts it', 'ما الذي يرفعه')}</dt>
                  <dd className="mt-1 max-w-readable leading-relaxed text-ink">{ev.seniority.lift}</dd>
                </div>
              </dl>
            </Card>
          </section>

          {/* ---- Findings ---- */}
          {ev.weaknesses.length > 0 && (
            <FindingList
              title={t('What weakened your impact', 'ما الذي أضعف أثرك')}
              findings={ev.weaknesses} ar={ar} tone="caution" L={L}
            />
          )}
          {ev.strengths.length > 0 && (
            <FindingList
              title={t('What worked', 'ما الذي نجح')}
              findings={ev.strengths} ar={ar} tone="positive" L={L}
            />
          )}

          {/* ---- Dimensions ---- */}
          <section className="mb-10">
            <SectionTitle hint={t('bands, never scores', 'مستويات، وليست درجات')}>
              {t('Executive evaluation', 'التقييم التنفيذي')}
            </SectionTitle>
            <Card className="divide-y divide-line/60">
              {ev.dimensions.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="text-sm text-ink">{L(d.dimension)}</span>
                  <BandChip band={d.band as Band} ar={ar} />
                </div>
              ))}
            </Card>
          </section>

          {/* ---- Metrics: the two tiers, visually separated ---- */}
          <section className="mb-10 grid gap-6 md:grid-cols-2">
            <div>
              <SectionTitle>{t('Measured', 'مقاس')}</SectionTitle>
              <TierNote text={labels.tierNotes.objective} />
              <Card className="px-4 py-1">
                {objective.map((m) => <MetricRowFor key={m.key} m={m} />)}
              </Card>
            </div>
            <div>
              <SectionTitle>{t('Counted by rule', 'محسوب بقاعدة')}</SectionTitle>
              <TierNote text={labels.tierNotes.semi_objective} />
              <Card className="px-4 py-1">
                {semi.map((m) => <MetricRowFor key={m.key} m={m} />)}
              </Card>
            </div>
          </section>

          {/* ---- Stakeholder ---- */}
          <section className="mb-10">
            <SectionTitle>{t('Likely stakeholder conclusion', 'الاستنتاج المرجّح لصاحب القرار')}</SectionTitle>
            <Card className="p-5">
              <p className="max-w-readable text-sm leading-relaxed text-ink">{ev.stakeholderPerception}</p>
            </Card>
          </section>

          {/* ---- Provenance + rejected findings (trust surface) ---- */}
          <section className="mb-6">
            <SectionTitle>{t('Provenance', 'مصدر التقييم')}</SectionTitle>
            <Card className="p-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11px] text-faint md:grid-cols-4">
                <div><dt>rubric</dt><dd className="text-muted">{ev.rubricId} v{ev.rubricVersion} ({run.rubric.status})</dd></div>
                <div><dt>language</dt><dd className="text-muted">{ev.language}</dd></div>
                <div><dt>model</dt><dd className="text-muted">{ev.modelId}</dd></div>
                <div><dt>analysed</dt><dd className="text-muted">{new Date(ev.createdAt).toISOString().slice(0, 16)}Z</dd></div>
              </dl>
              <button
                onClick={() => setShowRejected((v) => !v)}
                className="mt-4 text-xs text-muted underline decoration-line underline-offset-4 hover:text-ink"
              >
                {ev.rejected.length} {t('findings rejected before you saw them', 'استنتاجاً رُفض قبل عرضه عليك')}
                {showRejected ? ' ▴' : ' ▾'}
              </button>
              {showRejected && (
                <div className="mt-3 space-y-2">
                  <p className="max-w-readable text-xs leading-relaxed text-faint">
                    {t(
                      'Findings the model produced that failed verification. They are dropped in code, not filtered in the prompt — an unevidenced claim about how you came across never reaches this page.',
                      'استنتاجات أنتجها النموذج ولم تجتز التحقق. تُسقَط برمجياً لا بالتوجيه — أي ادعاء غير مسنَد بدليل عن انطباعك لا يصل الى هذه الصفحة.',
                    )}
                  </p>
                  {ev.rejected.map((r, i) => (
                    <div key={i} className="rounded-lg border border-line/70 bg-surface px-3 py-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-critical">{r.reason}</span>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{r.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function MetricRowFor({ m }: { m: Metric }) {
  return (
    <MetricRow
      label={m.label} value={m.value} unit={m.unit} tier={m.tier}
      ruleVersion={m.ruleVersion} target={m.target}
    />
  );
}

function FindingList({
  title, findings, ar, tone, L,
}: { title: string; findings: Finding[]; ar: boolean; tone: 'caution' | 'positive'; L: (id: string) => string }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  return (
    <section className="mb-10">
      <SectionTitle>{title}</SectionTitle>
      <div className="space-y-3">
        {findings.map((f, i) => (
          <Card key={i} className="overflow-hidden">
            <div className={`h-0.5 w-full ${tone === 'caution' ? 'bg-caution/50' : 'bg-positive/50'}`} />
            <div className="p-4">
              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
                  {L(f.dimension)}
                </span>
                {f.numericReviewFlag ? (
                  <span className="rounded border border-caution/40 px-1.5 text-[10px] text-caution">
                    {t('unverified number', 'رقم غير محقق')}
                  </span>
                ) : null}
              </div>
              <p className="max-w-readable text-sm font-medium leading-relaxed text-ink">{f.finding}</p>
              {f.evidence.map((e, j) => <Evidence key={j} quote={e.quote} startMs={e.startMs} />)}
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wider text-faint">{t('Why it matters', 'لماذا يهم')}</div>
                  <p className="mt-1 leading-relaxed text-muted">{f.whyItMatters}</p>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-faint">{t('Change', 'التغيير')}</div>
                  <p className="mt-1 leading-relaxed text-ink">{f.recommendedChange}</p>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Comparison({
  run, comparison, attempt2, ar, L, S,
}: {
  run: DemoRun;
  comparison: NonNullable<DemoRun['comparison']>;
  attempt2: NonNullable<DemoRun['attempt2']>;
  ar: boolean; L: (id: string) => string; S: (id: string) => string;
}) {
  const c = comparison;
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const verdictStyle = {
    achieved: 'border-positive/40 bg-positive/5 text-positive',
    partial: 'border-caution/40 bg-caution/5 text-caution',
    not_achieved: 'border-critical/40 bg-critical/5 text-critical',
    not_measurable: 'border-line bg-surface text-muted',
  }[c.targetOutcome.verdict];

  const verdictLabel = {
    achieved: t('Achieved', 'تحقق'),
    partial: t('Partly achieved', 'تحقق جزئياً'),
    not_achieved: t('Not achieved', 'لم يتحقق'),
    not_measurable: t('Not measurable', 'غير قابل للقياس'),
  }[c.targetOutcome.verdict];

  const pct = (p: number | null) => (p === null ? t('from zero', 'من الصفر') : `${p > 0 ? '+' : ''}${p}%`);

  return (
    <div className="mb-10">
      <Card className={`mb-6 border p-5 ${verdictStyle}`}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">
          {t('Objective', 'الهدف')}
        </div>
        <p className="mt-1 max-w-readable text-base leading-relaxed text-ink">{c.objective.statement}</p>
        <div className="mt-4 flex flex-wrap items-baseline gap-3">
          <span className="text-lg font-semibold">{verdictLabel}</span>
          <span className="text-sm text-muted">{c.targetOutcome.explanation}</span>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <SectionTitle hint={`${c.improved.length}`}>{t('Improved', 'تحسّن')}</SectionTitle>
          <Card className="px-4 py-1">
            {c.improved.length === 0 ? (
              <p className="py-3 text-sm text-faint">{t('Nothing moved.', 'لا شيء تحرك.')}</p>
            ) : c.improved.map((d) => (
              <div key={d.key} className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-0">
                <span className="truncate text-sm text-ink">{d.label}</span>
                <span className="nums shrink-0 text-xs text-muted">
                  {formatMetric(d.before, d.unit)} → <span className="font-medium text-positive">{formatMetric(d.after, d.unit)}</span>
                  <span className="ms-2 text-faint">{pct(d.pctChange)}</span>
                </span>
              </div>
            ))}
          </Card>
        </div>

        <div>
          <SectionTitle hint={`${c.regressed.length}`}>{t('Regressed', 'تراجع')}</SectionTitle>
          <Card className="px-4 py-1">
            {c.regressed.length === 0 ? (
              <p className="py-3 text-sm text-faint">{t('Nothing got worse.', 'لم يتراجع شيء.')}</p>
            ) : c.regressed.map((d) => (
              <div key={d.key} className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-0">
                <span className="truncate text-sm text-ink">{d.label}</span>
                <span className="nums shrink-0 text-xs text-muted">
                  {formatMetric(d.before, d.unit)} → <span className="font-medium text-critical">{formatMetric(d.after, d.unit)}</span>
                  <span className="ms-2 text-faint">{pct(d.pctChange)}</span>
                </span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <SectionTitle hint={t('reported, not the verdict', 'مُبلَّغ عنه، وليس الحكم')}>
            {t('Band movement', 'حركة المستويات')}
          </SectionTitle>
          <Card className="px-4 py-1">
            {c.bandMovements.length === 0 ? (
              <p className="py-3 text-sm text-faint">{t('No band changed.', 'لم يتغير أي مستوى.')}</p>
            ) : c.bandMovements.map((b) => (
              <div key={b.dimension} className="flex items-center justify-between gap-3 border-b border-line/60 py-2.5 last:border-0">
                <span className="text-sm text-ink">{L(b.dimension)}</span>
                <span className="flex items-center gap-2">
                  <BandChip band={b.before} ar={ar} />
                  <span className="text-faint">→</span>
                  <BandChip band={b.after} ar={ar} />
                </span>
              </div>
            ))}
          </Card>
          <p className="mt-2 max-w-readable text-xs leading-relaxed text-faint">
            {t(
              'Band movement is an AI reading and is never trended across sessions — a band can shift because the rubric or model changed rather than because you did. The measured metrics above carry the verdict.',
              'حركة المستويات قراءة ذكاء اصطناعي ولا تُتتبع عبر الجلسات — قد يتغير المستوى بسبب تغيّر المعيار أو النموذج لا بسبب تغيّرك أنت. المقاييس أعلاه هي التي تحمل الحكم.',
            )}
          </p>
        </div>

        <div>
          <SectionTitle>{t('Findings', 'الاستنتاجات')}</SectionTitle>
          <Card className="divide-y divide-line/60">
            <CmpRow label={t('Resolved', 'انحلّت')} items={c.resolvedWeaknesses} tone="positive" ar={ar} L={L} />
            <CmpRow label={t('Persistent', 'مستمرة')} items={c.persistentWeaknesses} tone="caution" ar={ar} L={L} />
            <CmpRow label={t('New', 'جديدة')} items={c.newWeaknesses} tone="critical" ar={ar} L={L} />
          </Card>
          <div className="mt-4">
            <SectionTitle>{t('Seniority', 'المستوى القيادي')}</SectionTitle>
            <Card className="flex items-center gap-3 p-4 text-sm">
              <span className="text-muted">{S(run.attempt1.result.evaluation.seniority.soundsLike)}</span>
              <span className="text-faint">→</span>
              <span className="font-medium text-ink">{S(attempt2.result.evaluation.seniority.soundsLike)}</span>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function CmpRow({
  label, items, tone, ar, L,
}: {
  label: string; items: string[]; tone: 'positive' | 'caution' | 'critical';
  ar: boolean; L: (id: string) => string;
}) {
  const color = { positive: 'text-positive', caution: 'text-caution', critical: 'text-critical' }[tone];
  return (
    <div className="px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-faint">{label}</div>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-faint">{ar ? 'لا شيء' : 'None'}</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {items.map((i) => (
            <li key={i} className={`text-sm ${color}`}>{L(i)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
