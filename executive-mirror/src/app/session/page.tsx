'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';

/**
 * Session setup and live session. (V2 §30)
 *
 * The mic check is a HARD GATE. The worst possible failure in this product is
 * a ten-minute rehearsal that recorded silence, so there is no skip link and
 * the Start button stays disabled until audio has actually been captured and
 * played back.
 *
 * The live screen is deliberately almost empty: no live transcript, no live
 * filler counter. In a real board meeting there is no dashboard, and a live
 * filler counter induces the stutter it is measuring.
 */

type Stage = 'setup' | 'miccheck' | 'live' | 'ended';
type Lang = 'en' | 'ar';

export default function SessionPage() {
  const [stage, setStage] = useState<Stage>('setup');
  const [lang, setLang] = useState<Lang>('en');
  const [minutes, setMinutes] = useState(8);

  return (
    <main dir={lang === 'ar' ? 'rtl' : 'ltr'} className="mx-auto max-w-2xl px-5 py-12 md:px-8">
      <nav className="mb-10">
        <a href="/" className="text-xs font-medium uppercase tracking-[0.14em] text-muted hover:text-ink">
          ← Executive Mirror
        </a>
      </nav>

      {stage === 'setup' && (
        <Setup
          lang={lang} setLang={setLang} minutes={minutes} setMinutes={setMinutes}
          onNext={() => setStage('miccheck')}
        />
      )}
      {stage === 'miccheck' && (
        <MicCheck lang={lang} onPass={() => setStage('live')} onBack={() => setStage('setup')} />
      )}
      {stage === 'live' && <Live lang={lang} minutes={minutes} onEnd={() => setStage('ended')} />}
      {stage === 'ended' && <Ended lang={lang} />}
    </main>
  );
}

function Setup({
  lang, setLang, minutes, setMinutes, onNext,
}: {
  lang: Lang; setLang: (l: Lang) => void;
  minutes: number; setMinutes: (m: number) => void; onNext: () => void;
}) {
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-ink">
        {t('Executive job interview', 'مقابلة وظيفية تنفيذية')}
      </h1>
      <p className="mb-8 max-w-readable text-sm leading-relaxed text-muted">
        {t(
          'A Group COO is interviewing you for a direct report at Executive Director level. They have read your CV and are no longer establishing whether you have done the work.',
          'الرئيس التنفيذي للعمليات في مجموعة يجري معك مقابلة لمنصب يتبع له مباشرة بمستوى مدير تنفيذي. اطّلع على سيرتك الذاتية ولم يعد يتحقق مما إذا كنت قد أنجزت العمل.',
        )}
      </p>

      <Card className="mb-4 p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-faint">
          {t('Language', 'اللغة')}
        </div>
        <div className="flex gap-2">
          {(['en', 'ar'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm transition-colors ${
                lang === l ? 'border-accent/50 bg-accent/10 text-ink' : 'border-line text-muted hover:text-ink'
              }`}
            >
              {l === 'en' ? 'English' : 'العربية'}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          {t(
            'Both languages are first-class. Switching between them mid-answer is normal professional register and is never counted against you.',
            'اللغتان أساسيتان. التنقل بينهما داخل الإجابة سجل مهني طبيعي ولا يُحتسب ضدك أبداً.',
          )}
        </p>
      </Card>

      <Card className="mb-6 p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-faint">
          {t('Length', 'المدة')}
        </div>
        <div className="flex gap-2">
          {[4, 8, 15].map((m) => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm transition-colors ${
                minutes === m ? 'border-accent/50 bg-accent/10 text-ink' : 'border-line text-muted hover:text-ink'
              }`}
            >
              {m} {t('min', 'دقيقة')}
            </button>
          ))}
        </div>
      </Card>

      <Button variant="primary" onClick={onNext} className="w-full">
        {t('Check microphone', 'فحص الميكروفون')}
      </Button>
    </>
  );
}

function MicCheck({ lang, onPass, onBack }: { lang: Lang; onPass: () => void; onBack: () => void }) {
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [state, setState] = useState<'idle' | 'requesting' | 'denied' | 'listening' | 'recorded' | 'played'>('idle');
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [error, setError] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const urlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    void ctxRef.current?.close().catch(() => {});
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  async function request() {
    setState('requesting');
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i]! - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const pct = Math.min(100, rms * 320);
        setLevel(pct);
        setPeak((p) => Math.max(p, pct));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      // Record three seconds so the check proves capture, not just permission.
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        urlRef.current = URL.createObjectURL(blob);
        setState('recorded');
      };
      rec.start();
      setState('listening');
      setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 3000);
    } catch (e) {
      setState('denied');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function playback() {
    if (!urlRef.current) return;
    const a = new Audio(urlRef.current);
    void a.play();
    a.onended = () => setState('played');
  }

  // The gate: permission granted AND measurable signal AND played back.
  const heard = peak > 6;
  const canStart = state === 'played' && heard;

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-ink">
        {t('Microphone check', 'فحص الميكروفون')}
      </h1>
      <p className="mb-8 max-w-readable text-sm leading-relaxed text-muted">
        {t(
          'This step is not optional. A session that silently recorded nothing wastes the ten minutes that matter most.',
          'هذه الخطوة ليست اختيارية. الجلسة التي لا تسجل شيئاً دون أن تدري تُهدر الدقائق العشر الأهم.',
        )}
      </p>

      <Card className="mb-4 p-6">
        <div className="mb-5 h-3 overflow-hidden rounded-full bg-surface">
          <div
            className={`h-full transition-[width] duration-75 ${heard ? 'bg-positive' : 'bg-accent'}`}
            style={{ width: `${level}%` }}
          />
        </div>

        <div className="space-y-2 text-sm">
          <Check ok={state !== 'idle' && state !== 'requesting' && state !== 'denied'}>
            {t('Permission granted', 'تم منح الإذن')}
          </Check>
          <Check ok={heard}>
            {t('Sound detected', 'تم رصد الصوت')}
            {state === 'listening' && !heard ? (
              <span className="ms-2 text-faint">{t('— say something', '— قل شيئاً')}</span>
            ) : null}
          </Check>
          <Check ok={state === 'played'}>
            {t('You heard yourself back', 'سمعت صوتك مسجلاً')}
          </Check>
        </div>

        {state === 'denied' && (
          <div className="mt-4 rounded-lg border border-critical/40 bg-critical/5 p-3">
            <p className="text-sm text-critical">
              {t('Microphone access was refused.', 'تم رفض الوصول الى الميكروفون.')}
            </p>
            <p className="mt-1 text-xs text-muted">{error}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {t(
                'Allow microphone access for this site in your browser settings, then try again. This page must be served over HTTPS or localhost.',
                'اسمح بالوصول الى الميكروفون لهذا الموقع من إعدادات المتصفح ثم أعد المحاولة. يجب أن تُقدَّم هذه الصفحة عبر HTTPS أو localhost.',
              )}
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {state === 'idle' || state === 'denied' ? (
            <Button variant="primary" onClick={request}>
              {t('Test microphone', 'اختبر الميكروفون')}
            </Button>
          ) : null}
          {state === 'recorded' ? (
            <Button variant="primary" onClick={playback}>
              {t('Play back 3 seconds', 'استمع الى ٣ ثوانٍ')}
            </Button>
          ) : null}
          {state === 'played' && !heard ? (
            <Button variant="secondary" onClick={() => { setPeak(0); void request(); }}>
              {t('Try again', 'أعد المحاولة')}
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack}>{t('Back', 'رجوع')}</Button>
        <Button variant="primary" onClick={onPass} disabled={!canStart} className="flex-1">
          {canStart
            ? t('Start session', 'ابدأ الجلسة')
            : t('Complete the check to start', 'أكمل الفحص للبدء')}
        </Button>
      </div>
    </>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
        ok ? 'border-positive bg-positive/15 text-positive' : 'border-line text-faint'
      }`}>{ok ? '✓' : ''}</span>
      <span className={ok ? 'text-ink' : 'text-faint'}>{children}</span>
    </div>
  );
}

function Live({ lang, minutes, onEnd }: { lang: Lang; minutes: number; onEnd: () => void }) {
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const over = elapsed > minutes * 60;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="relative mb-10 flex h-28 w-28 items-center justify-center">
        <span className="pulse-ring absolute inset-0 rounded-full bg-accent/20" />
        <span className="relative flex h-20 w-20 items-center justify-center rounded-full border border-accent/40 bg-accent/10">
          <span className="h-3 w-3 rounded-full bg-accent" />
        </span>
      </div>

      <div className={`nums mb-2 font-mono text-4xl tabular-nums ${over ? 'text-caution' : 'text-ink'}`}>
        {mm}:{ss}
      </div>
      <p className="mb-10 max-w-sm text-sm leading-relaxed text-faint">
        {t(
          'Nothing is shown while you speak. A live transcript or filler counter would take attention away from the conversation — and induce the hesitation it measures.',
          'لا يُعرض شيء أثناء حديثك. النص المباشر أو عدّاد الحشو يسحب الانتباه من المحادثة — ويُحدث التردد الذي يقيسه.',
        )}
      </p>

      <Button variant="secondary" onClick={onEnd}>
        {t('End session', 'إنهاء الجلسة')}
      </Button>
    </div>
  );
}

function Ended({ lang }: { lang: Lang }) {
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  return (
    <div className="py-16 text-center">
      <h1 className="mb-3 text-2xl font-semibold tracking-tight text-ink">
        {t('Session ended', 'انتهت الجلسة')}
      </h1>
      <p className="mx-auto mb-8 max-w-readable text-sm leading-relaxed text-muted">
        {t(
          'With provider keys configured, analysis returns in under 30 seconds. Without them the voice loop is silent — but the full report pipeline runs, and you can walk it on the worked example.',
          'مع تكوين مفاتيح المزودين، يعود التحليل خلال أقل من ٣٠ ثانية. بدونها تكون حلقة الصوت صامتة — لكن مسار التقرير الكامل يعمل، ويمكنك تصفحه على المثال العملي.',
        )}
      </p>
      <Button variant="primary" href={`/report?lang=${lang}`}>
        {t('Open the worked example report', 'افتح تقرير المثال العملي')}
      </Button>
    </div>
  );
}
