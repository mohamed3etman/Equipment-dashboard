/**
 * REAL PROVIDER VALIDATION. (Validation Gate 1 §1)
 *
 * Nothing in this file uses a mock. If a check cannot execute it is reported
 * UNVALIDATED, never as a pass.
 *
 *   npx tsx scripts/validate-providers.ts            # all checks
 *   npx tsx scripts/validate-providers.ts --lang ar  # one language
 *
 * The STT check is a round trip: a known sentence is synthesised with the real
 * TTS, then transcribed with the real STT, and the result is compared to the
 * original. That exercises both vendors against ground truth and is the only
 * way to measure word-timestamp quality without hand-labelled audio.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSessionConfig } from '../src/config/loader';
import { buildPersonaSystemPrompt } from '../src/analysis/prompts';
import { computeMetrics } from '../src/analysis/metrics';
import { normalize } from '../src/analysis/normalize';
import type { Lang, Word } from '../src/lib/types';
import type { LlmProvider, SttProvider, TtsProvider } from '../src/providers/types';

type Status = 'PASS' | 'FAIL' | 'UNVALIDATED';
interface Check { name: string; status: Status; detail: string; metric?: string }
const checks: Check[] = [];
const add = (name: string, status: Status, detail: string, metric?: string) => {
  checks.push({ name, status, detail, metric });
  const icon = status === 'PASS' ? '  ok  ' : status === 'FAIL' ? ' FAIL ' : ' ---- ';
  console.log(`${icon} ${name.padEnd(42)} ${metric ? metric.padEnd(22) : ''.padEnd(22)} ${detail}`);
};

const args = process.argv.slice(2);
const langArg = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null;
const LANGS: Lang[] = langArg === 'ar' ? ['ar'] : langArg === 'en' ? ['en'] : ['en', 'ar'];
const OUT = join(process.cwd(), '.validation');

/** Ground-truth probes. Chosen to contain numbers, domain terms and, for the mixed case, a real code switch. */
const PROBES: Record<string, { lang: Lang; text: string; expectTokens: string[] }> = {
  en: {
    lang: 'en',
    text: 'Report turnaround went from forty eight hours to two hours within one quarter.',
    expectTokens: ['turnaround', 'hours', 'quarter'],
  },
  ar: {
    lang: 'ar',
    text: 'زمن إصدار التقرير انخفض من ثمان وأربعين ساعة إلى ساعتين خلال ربع واحد.',
    expectTokens: ['التقرير', 'ساعة', 'ربع'],
  },
  mixed: {
    lang: 'ar',
    text: 'قررت ننقل document control بالكامل، والـ turnaround نزل من ثمان وأربعين ساعة إلى ساعتين.',
    expectTokens: ['document', 'control', 'turnaround', 'ساعة'],
  },
};

function keysPresent() {
  return {
    stt: Boolean(process.env.DEEPGRAM_API_KEY),
    llm: Boolean(process.env.ANTHROPIC_API_KEY),
    tts: Boolean(process.env.ELEVENLABS_API_KEY),
    voiceEn: Boolean(process.env.EM_TTS_VOICE_EN),
    voiceAr: Boolean(process.env.EM_TTS_VOICE_AR),
  };
}

async function main() {
  console.log('\nEXECUTIVE MIRROR — REAL PROVIDER VALIDATION');
  console.log('='.repeat(96));
  const k = keysPresent();
  console.log(`credentials: STT=${k.stt ? 'set' : 'MISSING'}  LLM=${k.llm ? 'set' : 'MISSING'}  TTS=${k.tts ? 'set' : 'MISSING'}  voices=${k.voiceEn ? 'en ' : ''}${k.voiceAr ? 'ar' : ''}${!k.voiceEn && !k.voiceAr ? 'MISSING' : ''}`);
  console.log('='.repeat(96) + '\n');
  mkdirSync(OUT, { recursive: true });

  let stt: SttProvider | null = null;
  let llm: LlmProvider | null = null;
  let tts: TtsProvider | null = null;
  let ttsPcm: TtsProvider | null = null;

  if (k.stt) {
    const { DeepgramSttProvider } = await import('../src/providers/stt/deepgram');
    stt = new DeepgramSttProvider(process.env.DEEPGRAM_API_KEY!);
  }
  if (k.llm) {
    const { AnthropicLlmProvider } = await import('../src/providers/llm/anthropic');
    llm = new AnthropicLlmProvider(process.env.ANTHROPIC_API_KEY!);
  }
  if (k.tts) {
    const { ElevenLabsTtsProvider } = await import('../src/providers/tts/elevenlabs');
    // Two instances: mp3 for the human listening check, pcm16 for the STT
    // round trip. Feeding mp3 bytes to a linear16 STT endpoint yields garbage
    // rather than an error, which would masquerade as poor STT accuracy.
    tts = new ElevenLabsTtsProvider(process.env.ELEVENLABS_API_KEY!, undefined, 'mp3');
    ttsPcm = new ElevenLabsTtsProvider(process.env.ELEVENLABS_API_KEY!, undefined, 'pcm16');
  }

  // ------------------------------------------------------------ TTS
  const audio: Record<string, Uint8Array> = {};
  for (const [name, probe] of Object.entries(PROBES)) {
    if (!LANGS.includes(probe.lang)) continue;
    if (!tts) { add(`TTS synthesis [${name}]`, 'UNVALIDATED', 'ELEVENLABS_API_KEY not set'); continue; }
    const voiceId = tts.voiceFor(probe.lang, {});
    if (!voiceId) { add(`TTS synthesis [${name}]`, 'UNVALIDATED', `EM_TTS_VOICE_${probe.lang.toUpperCase()} not set`); continue; }
    try {
      const t0 = Date.now();
      let firstChunkAt = 0;
      const parts: Uint8Array[] = [];
      for await (const c of tts.stream({ text: probe.text, language: probe.lang, voiceId })) {
        if (!firstChunkAt) firstChunkAt = Date.now();
        parts.push(c);
      }
      const bytes = parts.reduce((a, p) => a + p.length, 0);
      const merged = new Uint8Array(bytes);
      let o = 0; for (const p of parts) { merged.set(p, o); o += p.length; }
      audio[name] = merged;
      writeFileSync(join(OUT, `tts-${name}.mp3`), merged);
      add(`TTS synthesis [${name}]`, bytes > 2000 ? 'PASS' : 'FAIL',
        `${bytes} bytes → .validation/tts-${name}.mp3 (listen to judge quality)`,
        `ttfb ${firstChunkAt - t0}ms`);
    } catch (e) {
      add(`TTS synthesis [${name}]`, 'FAIL', e instanceof Error ? e.message.slice(0, 90) : String(e));
    }
  }

  // ------------------------------------------------------------ STT round trip
  for (const [name, probe] of Object.entries(PROBES)) {
    if (!LANGS.includes(probe.lang)) continue;
    if (!stt) { add(`STT round trip [${name}]`, 'UNVALIDATED', 'DEEPGRAM_API_KEY not set'); continue; }
    if (!ttsPcm) { add(`STT round trip [${name}]`, 'UNVALIDATED', 'no TTS to generate probe audio'); continue; }
    try {
      // Re-synthesise as linear16 for the STT, independent of the mp3 above.
      const pcmVoice = ttsPcm.voiceFor(probe.lang, {});
      const pcmParts: Uint8Array[] = [];
      for await (const c of ttsPcm.stream({ text: probe.text, language: probe.lang, voiceId: pcmVoice })) {
        pcmParts.push(c);
      }
      const pcmBytes = pcmParts.reduce((a, p) => a + p.length, 0);
      const pcm = new Uint8Array(pcmBytes);
      { let o = 0; for (const p of pcmParts) { pcm.set(p, o); o += p.length; } }
      const t0 = Date.now();
      const session = await stt.open({
        language: probe.lang, sampleRate: 16000, endpointingMs: 900, multilingual: true,
      });
      let finalText = ''; let words: Word[] = []; let finalAt = 0;
      session.on((ev) => {
        if (ev.type === 'final') { finalText += (finalText ? ' ' : '') + ev.text; words = words.concat(ev.words); finalAt = Date.now(); }
      });
      // NOTE: the adapter expects linear16; mp3 must be decoded first. Handled
      // by requesting pcm output where the vendor supports it — see README.
      // Feed in 20ms frames, as the browser does, rather than one blob.
      const FRAME = 640;
      for (let i = 0; i < pcm.length; i += FRAME) session.write(pcm.subarray(i, i + FRAME));
      await new Promise((r) => setTimeout(r, 6000));
      await session.close();

      const norm = normalize(finalText);
      const hits = probe.expectTokens.filter((t) => norm.includes(normalize(t)));
      const timed = words.filter((w) => w.endMs > w.startMs).length;
      const ok = hits.length >= Math.ceil(probe.expectTokens.length * 0.6) && timed > 0;

      add(`STT round trip [${name}]`, ok ? 'PASS' : 'FAIL',
        `heard "${finalText.slice(0, 60)}" — ${hits.length}/${probe.expectTokens.length} key tokens`,
        `${finalAt ? finalAt - t0 : 0}ms`);
      add(`  word timestamps [${name}]`, timed > 0 ? 'PASS' : 'FAIL',
        timed > 0 ? `${timed}/${words.length} words carry non-zero spans` : 'NO word timings — every Pass 0 metric depends on these',
        `${words.length} words`);
      writeFileSync(join(OUT, `stt-${name}.json`), JSON.stringify({ finalText, words }, null, 2));
    } catch (e) {
      add(`STT round trip [${name}]`, 'FAIL', e instanceof Error ? e.message.slice(0, 90) : String(e));
    }
  }

  // ------------------------------------------------------------ LLM persona
  for (const lang of LANGS) {
    if (!llm) { add(`LLM persona turn [${lang}]`, 'UNVALIDATED', 'ANTHROPIC_API_KEY not set'); continue; }
    try {
      const cfg = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', lang);
      const system = buildPersonaSystemPrompt(cfg);
      const weak = lang === 'ar'
        ? 'يعني احنا حسّنا العملية بشكل كبير وكان في تحسن ملحوظ على مستوى المجموعة.'
        : 'Well, we improved the process quite a lot and there was a significant improvement across the group.';

      const t0 = Date.now();
      let firstToken = 0; let out = '';
      for await (const d of llm.stream({ system, messages: [{ role: 'user', content: weak }], maxTokens: 300 })) {
        if (!firstToken) firstToken = Date.now();
        out += d;
      }
      const sentences = out.split(/[.!?؟۔]+/).filter((s) => s.trim().length > 3).length;
      const cap = cfg.persona.questioning_style.turn_shape.max_sentences;
      const praised = /great|excellent|well done|helpful|appreciate|ممتاز|رائع|أحسنت/i.test(out);

      add(`LLM persona turn [${lang}]`, out.trim() ? 'PASS' : 'FAIL',
        `"${out.trim().slice(0, 70)}"`, `ttft ${firstToken - t0}ms`);
      add(`  holds ${cap}-sentence cap [${lang}]`, sentences <= cap ? 'PASS' : 'FAIL',
        `${sentences} sentences (cap ${cap}) — over-long turns mean persona drift`);
      add(`  refuses to praise [${lang}]`, praised ? 'FAIL' : 'PASS',
        praised ? 'persona praised a weak answer — drift toward helpfulness' : 'no praise on a weak answer');
      add(`  presses the weak claim [${lang}]`, /\?|؟/.test(out) ? 'PASS' : 'FAIL',
        /\?|؟/.test(out) ? 'responded with a question' : 'did not ask anything back');
    } catch (e) {
      add(`LLM persona turn [${lang}]`, 'FAIL', e instanceof Error ? e.message.slice(0, 90) : String(e));
    }
  }

  // ------------------------------------------------------------ Pass 0 on real STT output
  for (const [name, probe] of Object.entries(PROBES)) {
    if (!LANGS.includes(probe.lang)) continue;
    const sttFile = join(OUT, `stt-${name}.json`);
    if (!existsSync(sttFile)) {
      add(`Pass 0 on real audio [${name}]`, 'UNVALIDATED', 'no real transcript — STT round trip did not produce one');
      continue;
    }
    try {
      const { finalText, words } = JSON.parse(readFileSync(sttFile, 'utf8')) as { finalText: string; words: Word[] };
      const last = words[words.length - 1];
      const m = computeMetrics(
        {
          sessionId: `probe-${name}`, language: probe.lang,
          turns: [{
            index: 0, speaker: 'user', text: finalText,
            startMs: words[0]?.startMs ?? 0, endMs: last?.endMs ?? 0, words,
          }],
        },
        (await import('../src/config/loader')).loadLexicon(probe.lang),
      );
      const wpm = m.byKey.words_per_minute ?? 0;
      const quant = m.byKey.quantification_count ?? 0;
      // The probes all contain a spoken number, so quantification must fire on
      // a REAL transcript, not just on the hand-written corpus.
      add(`Pass 0 on real audio [${name}]`, wpm > 0 && quant > 0 ? 'PASS' : 'FAIL',
        `wpm=${wpm} quantified=${quant} (probe contains a spoken number, so quant must be > 0)`);
    } catch (e) {
      add(`Pass 0 on real audio [${name}]`, 'FAIL', e instanceof Error ? e.message.slice(0, 80) : String(e));
    }
  }

  // ------------------------------------------------------------ summary
  const n = (s: Status) => checks.filter((c) => c.status === s).length;
  console.log('\n' + '='.repeat(96));
  console.log(`PASS ${n('PASS')}   FAIL ${n('FAIL')}   UNVALIDATED ${n('UNVALIDATED')}`);
  if (n('UNVALIDATED') > 0) {
    console.log('\nUNVALIDATED — REAL PROVIDER TEST PENDING');
    console.log('Set the missing keys in .env.local and re-run. Do not treat any');
    console.log('UNVALIDATED row as a pass.');
  }
  console.log('='.repeat(96) + '\n');
  writeFileSync(join(OUT, 'provider-validation.json'), JSON.stringify({ ranAt: new Date().toISOString(), checks }, null, 2));

  // Exit codes matter here. An UNVALIDATED run must NOT exit 0: in CI, or in a
  // shell chain, a zero exit reads as "validated" when in fact nothing ran.
  // That is exactly the substitution of absence-of-failure for evidence that
  // this harness exists to prevent.
  //   0 = every check executed and passed
  //   1 = something executed and failed
  //   2 = nothing could be executed (missing credentials or blocked egress)
  if (n('FAIL') > 0) process.exit(1);
  if (n('UNVALIDATED') > 0) process.exit(2);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
