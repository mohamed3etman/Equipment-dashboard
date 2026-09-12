import WebSocket from 'ws';
import type {
  SttEvent, SttProvider, SttSession, SttSessionOptions,
} from '../types';
import type { Lang, Word } from '@/lib/types';
import { scriptOf } from '@/analysis/normalize';

/**
 * Deepgram streaming STT.
 *
 * Chosen for the live path because independent 2026 testing put its
 * end-of-utterance latency well ahead of the alternatives on Arabic, and
 * because it returns word-level timestamps — a hard requirement here, since
 * every metric in Pass 0 derives from them.
 *
 * `utterance_end_ms` is what gives us turn-taking without building a VAD.
 */
export class DeepgramSttProvider implements SttProvider {
  readonly id = 'deepgram';
  readonly supportsWordTimestamps = true as const;
  readonly supportsLanguages: Lang[] = ['en', 'ar'];

  constructor(private apiKey: string, private model = process.env.EM_STT_MODEL ?? 'nova-3') {}

  async open(opts: SttSessionOptions): Promise<SttSession> {
    const params = new URLSearchParams({
      model: this.model,
      encoding: 'linear16',
      sample_rate: String(opts.sampleRate),
      channels: '1',
      interim_results: 'true',
      punctuate: 'true',
      smart_format: 'true',
      // Word timings are non-negotiable — see analysis/metrics.ts.
      utterances: 'true',
      utterance_end_ms: String(opts.endpointingMs ?? 1000),
      vad_events: 'true',
    });

    // Code-switching must not break the transcript (V2 §3.3). Deepgram's
    // multilingual mode keeps both scripts in one stream; a fixed `language`
    // would force one script and silently mangle the other.
    if (opts.multilingual) params.set('language', 'multi');
    else params.set('language', opts.language === 'ar' ? 'ar' : 'en');

    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
      headers: { Authorization: `Token ${this.apiKey}` },
    });

    const handlers: Array<(e: SttEvent) => void> = [];
    const emit = (e: SttEvent) => { for (const h of handlers) h(e); };

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    ws.on('message', (raw) => {
      let msg: DeepgramMessage;
      try { msg = JSON.parse(raw.toString()) as DeepgramMessage; } catch { return; }

      if (msg.type === 'UtteranceEnd') {
        emit({ type: 'utterance_end', atMs: Math.round((msg.last_word_end ?? 0) * 1000) });
        return;
      }

      const alt = msg.channel?.alternatives?.[0];
      if (!alt) return;
      const text = alt.transcript?.trim() ?? '';
      if (!text) return;

      if (!msg.is_final) {
        emit({ type: 'partial', text });
        return;
      }

      const words: Word[] = (alt.words ?? []).map((w) => ({
        text: w.punctuated_word ?? w.word,
        startMs: Math.round(w.start * 1000),
        endMs: Math.round(w.end * 1000),
        confidence: w.confidence,
        script: scriptOf(w.punctuated_word ?? w.word),
      }));

      emit({ type: 'final', text, words, emittedAt: Date.now() });
    });

    return {
      write(chunk: Uint8Array) {
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
      },
      async close() {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'CloseStream' }));
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 2000);
          ws.once('close', () => { clearTimeout(t); resolve(); });
        });
        ws.close();
      },
      on(h) { handlers.push(h); },
    };
  }
}

interface DeepgramMessage {
  type?: string;
  is_final?: boolean;
  last_word_end?: number;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      words?: Array<{
        word: string;
        punctuated_word?: string;
        start: number;
        end: number;
        confidence: number;
      }>;
    }>;
  };
}
