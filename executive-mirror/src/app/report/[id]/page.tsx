import { notFound } from 'next/navigation';
import { getSession } from '@/session/store';
import { resolveLabels } from '@/lib/demo-session';
import { ReportView } from '@/components/report-view';

export const dynamic = 'force-dynamic';

/** A REAL session's report — the one the user just recorded, not the demo. */
export default async function SessionReportPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = getSession(id);
  if (!s) notFound();

  const labels = resolveLabels(s.language);

  return (
    <main>
      <nav className="border-b border-line bg-raised">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3 md:px-8">
          <a href="/" className="text-xs font-medium uppercase tracking-[0.14em] text-muted hover:text-ink">
            ← Executive Mirror
          </a>
          <span className="font-mono text-[10px] text-faint">
            {new Date(s.createdAt).toISOString().slice(0, 16).replace('T', ' ')}Z
          </span>
        </div>
      </nav>
      <ReportView
        run={{
          sessionId: s.id,
          language: s.language,
          scenarioLabel: s.scenarioLabel,
          personaLabel: s.personaLabel,
          rubric: s.rubric,
          attempt1: s.attempt1,
          attempt2: s.attempt2,
          comparison: s.comparison,
        }}
        labels={labels}
      />
    </main>
  );
}
