import Link from 'next/link';
import { loadSessionConfig } from '@/config/loader';
import { listSessions } from '@/session/store';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Dashboard. (V2 §31)
 *
 * Its only job is to answer "what do I do now?" without requiring a decision.
 * It therefore leads with the current focus and one recommended rep — never
 * with an empty scenario library.
 */
export default function Dashboard() {
  const en = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', 'en');
  const recent = listSessions();
  const providersLive = Boolean(process.env.DEEPGRAM_API_KEY && process.env.ANTHROPIC_API_KEY && process.env.ELEVENLABS_API_KEY);

  return (
    <main className="mx-auto max-w-5xl px-5 py-12 md:px-8">
      <header className="mb-10">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-faint">Executive Mirror</div>
        <h1 className="mt-2 max-w-readable text-3xl font-semibold leading-tight tracking-tight text-ink">
          If you were across the table, how would they read you?
        </h1>
      </header>

      {/* Current focus — the dashboard's reason to exist */}
      <Card className="mb-8 overflow-hidden border-accent/30">
        <div className="border-b border-line bg-accent/[0.04] px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Your current focus</span>
        </div>
        <div className="px-5 py-5">
          <p className="text-lg leading-relaxed text-ink">Lead with the conclusion.</p>
          <p className="mt-2 max-w-readable text-sm leading-relaxed text-muted">
            No sessions recorded yet. Your first five sessions establish a baseline — the system measures
            and does not coach until it has something honest to say.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/session"
              className="inline-flex items-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-raised transition-opacity hover:opacity-90 dark:text-surface"
            >
              Start a session
            </Link>
            <Link
              href="/report"
              className="inline-flex items-center rounded-lg border border-line bg-raised px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent/40"
            >
              See a worked example
            </Link>
          </div>
        </div>
      </Card>

      {recent.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-faint">
            Your sessions
          </h2>
          <Card className="divide-y divide-line/60">
            {recent.map((s) => (
              <Link
                key={s.id}
                href={`/report/${s.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink">{s.scenarioLabel}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-faint">
                    {new Date(s.createdAt).toISOString().slice(0, 16).replace('T', ' ')}Z · {s.language}
                    {s.comparison ? ` · retried (${s.comparison.targetOutcome.verdict})` : ' · no retry yet'}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {s.attempt1.result.evaluation.seniority.soundsLike.replace(/_/g, ' ')}
                </span>
              </Link>
            ))}
          </Card>
          <p className="mt-2 text-xs leading-relaxed text-faint">
            Held in the server process, not a database — they are gone if you restart
            <code className="mx-1 font-mono">dev:live</code>. Fine for a run of sessions in one sitting;
            say the word if you want them to survive a restart.
          </p>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-faint">Available now</h2>
          <Card className="divide-y divide-line/60">
            <div className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink">{en.scenario.label_en}</span>
                <span className="font-mono text-[10px] text-faint">v{en.scenario.version}</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted" dir="rtl">{en.scenario.label_ar}</p>
              <p className="mt-2 text-xs leading-relaxed text-faint">
                {en.persona.label_en} · {en.scenario.default_duration_minutes} min · English &amp; العربية
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs leading-relaxed text-faint">
                Five further scenarios — DBA defence, board review, accreditation survey defence,
                investor pitch, difficult internal conversation — are specified and not yet built.
              </p>
            </div>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-faint">System state</h2>
          <Card className="divide-y divide-line/60 text-sm">
            <Row label="Rubric (English)" value={`v${en.rubric.version} · stable`} />
            <Row
              label="Rubric (Arabic)"
              value={`v${loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', 'ar').rubric.version} · developing`}
            />
            <Row label="Voice providers" value={providersLive ? 'live' : 'mock — no API keys set'} warn={!providersLive} />
            <Row label="Sessions recorded" value={String(recent.length)} />
          </Card>
          {!providersLive && (
            <p className="mt-2 max-w-readable text-xs leading-relaxed text-faint">
              Without provider keys the voice loop is silent and evaluation is scripted, but the full
              journey — transcript, metrics, evidence-checked evaluation, retry, comparison — runs end to end.
              Add keys to <code className="font-mono">.env.local</code> to go live.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <span className="text-muted">{label}</span>
      <span className={warn ? 'text-caution' : 'text-ink'}>{value}</span>
    </div>
  );
}
