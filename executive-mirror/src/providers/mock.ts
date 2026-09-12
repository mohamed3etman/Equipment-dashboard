/**
 * Mock providers. (Decision D5)
 *
 * These are NOT throwaway stubs — they are how the full journey is exercised
 * end-to-end without vendor keys, and how the analysis pipeline is tested
 * deterministically in CI. They must honour the same contracts as the real
 * adapters, including word timestamps and streaming behaviour.
 */
import type {
  LlmProvider, LlmStreamOptions, SttEvent, SttProvider, SttSession,
  SttSessionOptions, TtsOptions, TtsProvider,
} from './types';
import type { Lang, Word } from '@/lib/types';
import { scriptOf } from '@/analysis/normalize';

/** Turn a text into words with plausible timings, as a real STT would. */
export function synthesiseWords(text: string, startMs = 0, msPerWord = 380): Word[] {
  let cursor = startMs;
  return text.split(/\s+/).filter(Boolean).map((t) => {
    // Longer words take longer, plus a small deterministic jitter.
    const dur = Math.round(msPerWord * (0.6 + Math.min(t.length, 12) / 12) + (t.length % 3) * 20);
    const w: Word = { text: t, startMs: cursor, endMs: cursor + dur, confidence: 0.94, script: scriptOf(t) };
    cursor = w.endMs + 60;
    return w;
  });
}

export class MockSttProvider implements SttProvider {
  readonly id = 'mock-stt';
  readonly supportsWordTimestamps = true as const;
  readonly supportsLanguages: Lang[] = ['en', 'ar'];

  /** Scripted user utterances, consumed in order. Set by tests / the demo runner. */
  constructor(private script: string[] = []) {}

  async open(_opts: SttSessionOptions): Promise<SttSession> {
    const handlers: Array<(e: SttEvent) => void> = [];
    let idx = 0;
    let clock = 0;
    return {
      write: () => {
        // Each write() stands for one completed utterance in mock mode.
        const text = this.script[idx++];
        if (text === undefined) return;
        const words = synthesiseWords(text, clock);
        const last = words[words.length - 1];
        clock = (last ? last.endMs : clock) + 400;
        for (const h of handlers) {
          h({ type: 'partial', text: text.slice(0, Math.ceil(text.length / 2)) });
          h({ type: 'final', text, words, emittedAt: Date.now() });
          h({ type: 'utterance_end', atMs: last ? last.endMs : clock });
        }
      },
      close: async () => {},
      on: (h) => { handlers.push(h); },
    };
  }
}

export class MockLlmProvider implements LlmProvider {
  readonly id = 'mock-llm';
  constructor(
    readonly modelId = 'mock-model-v1',
    private turns: string[] = [],
    private jsonFixture?: unknown,
  ) {}

  private turnIdx = 0;

  async *stream(_opts: LlmStreamOptions): AsyncIterable<string> {
    const text = this.turns[this.turnIdx++] ?? 'Go on.';
    for (const chunk of text.match(/.{1,12}/g) ?? [text]) {
      yield chunk;
    }
  }

  async json<T>(opts: LlmStreamOptions & { schemaHint: string }): Promise<T> {
    if (this.jsonFixture !== undefined) return this.jsonFixture as T;
    throw new Error(`MockLlmProvider.json called with no fixture (schema: ${opts.schemaHint})`);
  }

  /** Let a test swap the fixture between passes. */
  setJsonFixture(v: unknown) { this.jsonFixture = v; }
}

export class MockTtsProvider implements TtsProvider {
  readonly id = 'mock-tts';
  readonly supportsLanguages: Lang[] = ['en', 'ar'];
  readonly outputFormat = 'pcm16' as const;

  async *stream(opts: TtsOptions): AsyncIterable<Uint8Array> {
    // Emit silence proportional to the text length so latency accounting and
    // barge-in cancellation can be exercised realistically.
    const frames = Math.max(1, Math.ceil(opts.text.length / 20));
    for (let i = 0; i < frames; i++) {
      if (opts.signal?.aborted) return;
      yield new Uint8Array(640); // 20ms of 16kHz PCM16 silence
    }
  }

  voiceFor(language: Lang, _spec: Record<string, string>): string {
    return `mock-voice-${language}`;
  }
}
