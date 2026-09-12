/**
 * Provider abstraction. (V2 §34)
 *
 * Nothing above this layer may import a vendor SDK. Swapping Deepgram for
 * AssemblyAI, or ElevenLabs for Cartesia, must be a change to one adapter file
 * plus an environment variable — never a change to session or analysis code.
 */
import type { Lang, Word } from '@/lib/types';

// ---------------------------------------------------------------- STT

export interface SttPartial {
  type: 'partial';
  text: string;
}

export interface SttFinal {
  type: 'final';
  text: string;
  words: Word[];
  /** ms since epoch when the provider emitted this. For latency accounting. */
  emittedAt: number;
}

export interface SttUtteranceEnd {
  type: 'utterance_end';
  /** Provider's judgment that the speaker has finished. */
  atMs: number;
}

export type SttEvent = SttPartial | SttFinal | SttUtteranceEnd;

export interface SttSessionOptions {
  language: Lang;
  sampleRate: number;
  /** Silence before the provider declares end-of-utterance. */
  endpointingMs?: number;
  /** Accept both scripts in one stream. Required for code-switching (§3.3). */
  multilingual?: boolean;
}

export interface SttSession {
  /** Push raw PCM16 mono. */
  write(chunk: Uint8Array): void;
  /** Signal end of audio; resolves once the provider has flushed. */
  close(): Promise<void>;
  on(handler: (e: SttEvent) => void): void;
}

export interface SttProvider {
  readonly id: string;
  /** Word-level timestamps are a hard requirement — see analysis/metrics.ts. */
  readonly supportsWordTimestamps: true;
  readonly supportsLanguages: Lang[];
  open(opts: SttSessionOptions): Promise<SttSession>;
}

// ---------------------------------------------------------------- LLM

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmStreamOptions {
  messages: LlmMessage[];
  /** Pinned prefix, cached where the provider supports it. */
  system?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LlmProvider {
  readonly id: string;
  readonly modelId: string;
  /** Streams text deltas. Used for the live persona turn. */
  stream(opts: LlmStreamOptions): AsyncIterable<string>;
  /** Single structured JSON completion. Used for analysis passes. */
  json<T>(opts: LlmStreamOptions & { schemaHint: string }): Promise<T>;
}

// ---------------------------------------------------------------- TTS

export interface TtsOptions {
  text: string;
  language: Lang;
  voiceId: string;
  signal?: AbortSignal;
}

export interface TtsProvider {
  readonly id: string;
  readonly supportsLanguages: Lang[];
  /** Streams audio chunks (mp3 or pcm, provider-declared). */
  stream(opts: TtsOptions): AsyncIterable<Uint8Array>;
  readonly outputFormat: 'mp3' | 'pcm16';
  voiceFor(language: Lang, spec: Record<string, string>): string;
}

// ---------------------------------------------------------------- Registry

export interface Providers {
  stt: SttProvider;
  llm: LlmProvider;
  /** Strong model for analysis passes. May be the same instance as `llm`. */
  analysisLlm: LlmProvider;
  tts: TtsProvider;
}
