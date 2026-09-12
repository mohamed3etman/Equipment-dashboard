import { resolveLabels, runDemoSession } from '@/lib/demo-session';
import { ReportView } from '@/components/report-view';
import type { Lang } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ReportPage({
  searchParams,
}: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  const language: Lang = lang === 'ar' ? 'ar' : 'en';
  const run = await runDemoSession(language);
  const labels = resolveLabels(language);

  return (
    <main>
      <nav className="border-b border-line bg-raised">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3 md:px-8">
          <a href="/" className="text-xs font-medium uppercase tracking-[0.14em] text-muted hover:text-ink">
            ← Executive Mirror
          </a>
          <div className="flex gap-1 text-xs">
            <a
              href="/report?lang=en"
              className={`rounded-md px-2.5 py-1 ${language === 'en' ? 'bg-accent/10 text-ink' : 'text-muted hover:text-ink'}`}
            >English</a>
            <a
              href="/report?lang=ar"
              className={`rounded-md px-2.5 py-1 ${language === 'ar' ? 'bg-accent/10 text-ink' : 'text-muted hover:text-ink'}`}
            >العربية</a>
          </div>
        </div>
      </nav>
      <ReportView run={run} labels={labels} />
    </main>
  );
}
