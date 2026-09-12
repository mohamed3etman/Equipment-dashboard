/**
 * The live conversation loop. (V2 §10, §11, §38)
 *
 * Transport-agnostic: it consumes PCM chunks and emits events. The WebSocket
 * server adapts it to the browser; tests drive it directly.
 *
 * Three things here are load-bearing and easy to get wrong:
 *
 *   1. TTS starts at the first SENTENCE boundary, not when the LLM finishes.
 *      This is the single largest perceived-latency win available. (V2 §38)
 *   2. Barge-in aborts the LLM stream AND cancels the TTS reader. An agent that
 *      keeps talking after you interrupt destroys the rehearsal instantly.
 *   3. Every stage is timestamped into `turnLatencies`. You cannot optimise
 *      what you did not measure at build time. (V2 §37)
 */
import type { Providers } from '@/providers/types';
import type { SessionConfig } from '@/config/loader';
import type { Turn, Word } from '@/lib/types';
import { dominantScript } from '@/analysis/normalize';
import {
  buildPersonaSystemPrompt, isChallengeTurn, personaDriftReminder, pickOpeningQuestion,
} from '@/analysis/prompts';

export interface TurnLatency {
  turnIndex: number;
  speechEndMs?: number;
  sttFinalMs?: number;
  llmFirstTokenMs?: number;
  ttsFirstAudioMs?: number;
  endToFirstAudioMs?: number;
}

export type OrchestratorEvent =
  | { type: 'persona_text'; turnIndex: number; text: string; isChallenge: boolean }
  | { type: 'persona_audio'; chunk: Uint8Array }
  | { type: 'persona_done'; turnIndex: number }
  | { type: 'user_partial'; text: string }
  | { type: 'user_final'; turn: Turn }
  | { type: 'barge_in'; turnIndex: number }
  | { type: 'latency'; latency: TurnLatency }
  | { type: 'error'; message: string };

export interface OrchestratorOptions {
  cfg: SessionConfig;
  providers: Providers;
  sampleRate?: number;
  /** Injected on a retry. The persona is told to behave identically. */
  focusObjective?: string;
  /** Pin the opening question so a retry asks the same thing. (V2 §18) */
  pinnedOpeningQuestionId?: string;
  onEvent: (e: OrchestratorEvent) => void;
}

/** Split streamed text at sentence boundaries so TTS can start early. */
export function extractSentence(buffer: string): { sentence: string; rest: string } | null {
  // Includes Arabic full stop (؟ ۔) alongside Latin terminators.
  const m = buffer.match(/^([\s\S]*?[.!?؟۔])(\s+|$)/);
  if (!m || !m[1]) return null;
  const sentence = m[1].trim();
  // Avoid firing on abbreviations and decimals — too short to be a sentence.
  if (sentence.length < 12) return null;
  return { sentence, rest: buffer.slice(m[0].length) };
}

export class SessionOrchestrator {
  private turns: Turn[] = [];
  private turnIndex = 0;
  private history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private systemPrompt: string;
  private personaAbort: AbortController | null = null;
  private speaking = false;
  private lastUserSpeechEndMs = 0;
  private clockStart = Date.now();
  private latencies: TurnLatency[] = [];
  private interruptionsUsed = 0;
  private openingQuestion: { id: string; text: string };

  constructor(private opts: OrchestratorOptions) {
    this.systemPrompt = buildPersonaSystemPrompt(opts.cfg, opts.focusObjective);
    this.openingQuestion = pickOpeningQuestion(opts.cfg, opts.pinnedOpeningQuestionId);
  }

  get openingQuestionId(): string { return this.openingQuestion.id; }
  get transcriptTurns(): Turn[] { return this.turns; }
  get turnLatencies(): TurnLatency[] { return this.latencies; }

  /** Persona speaks first — no countdown, no "begin when ready". (UX §13.2) */
  async start(): Promise<void> {
    this.clockStart = Date.now();
    await this.speak(this.openingQuestion.text, { isChallenge: false, skipLlm: true });
  }

  /** Feed raw PCM16 from the browser. */
  pushAudio(chunk: Uint8Array, stt: { write(c: Uint8Array): void }): void {
    // Barge-in: the user started talking while the persona was speaking.
    if (this.speaking && this.isVoiced(chunk)) this.bargeIn();
    stt.write(chunk);
  }

  /** Crude energy gate. The STT's own VAD is authoritative; this is for latency. */
  private isVoiced(chunk: Uint8Array): boolean {
    const view = new Int16Array(chunk.buffer, chunk.byteOffset, Math.floor(chunk.byteLength / 2));
    let sum = 0;
    for (let i = 0; i < view.length; i++) sum += Math.abs(view[i]!);
    return view.length > 0 && sum / view.length > 900;
  }

  private bargeIn(): void {
    if (!this.speaking) return;
    this.speaking = false;
    this.personaAbort?.abort();
    this.personaAbort = null;
    const last = this.turns[this.turns.length - 1];
    if (last && last.speaker === 'persona') last.interrupted = true;
    this.opts.onEvent({ type: 'barge_in', turnIndex: this.turnIndex });
  }

  /** Called when the STT declares an utterance complete. */
  async onUserUtterance(text: string, words: Word[], sttFinalAt: number): Promise<void> {
    if (!text.trim()) return;

    const startMs = words[0]?.startMs ?? this.relNow();
    const endMs = words[words.length - 1]?.endMs ?? this.relNow();
    const prev = this.turns[this.turns.length - 1];

    const turn: Turn = {
      index: this.turnIndex++,
      speaker: 'user',
      text,
      startMs,
      endMs,
      words,
      latencyBeforeMs: prev ? Math.max(0, startMs - prev.endMs) : undefined,
    };
    this.turns.push(turn);
    this.history.push({ role: 'user', content: text });
    this.lastUserSpeechEndMs = sttFinalAt;
    this.opts.onEvent({ type: 'user_final', turn });

    await this.respond();
  }

  private relNow(): number { return Date.now() - this.clockStart; }

  /** Generate and speak the persona's reply. */
  private async respond(): Promise<void> {
    const latency: TurnLatency = { turnIndex: this.turnIndex, speechEndMs: this.lastUserSpeechEndMs };
    latency.sttFinalMs = Date.now() - this.lastUserSpeechEndMs;

    const abort = new AbortController();
    this.personaAbort = abort;
    this.speaking = true;

    // Re-inject a compact persona reminder every few turns to counter the
    // drift toward helpfulness. (V2 §6.5 — the most underrated risk here.)
    const messages = [...this.history];
    if (this.turnIndex > 0 && this.turnIndex % 4 === 0) {
      messages.push({ role: 'user', content: personaDriftReminder(this.opts.cfg) });
    }

    let full = '';
    let buffer = '';
    let firstToken = 0;
    let firstAudio = 0;
    const t0 = Date.now();

    try {
      for await (const delta of this.opts.providers.llm.stream({
        system: this.systemPrompt,
        messages,
        maxTokens: 300,
        signal: abort.signal,
      })) {
        if (abort.signal.aborted) break;
        if (!firstToken) {
          firstToken = Date.now();
          latency.llmFirstTokenMs = firstToken - t0;
        }
        full += delta;
        buffer += delta;

        // Fire TTS at the first sentence boundary rather than waiting.
        const split = extractSentence(buffer);
        if (split) {
          buffer = split.rest;
          const at = await this.synthesise(split.sentence, abort.signal);
          if (at && !firstAudio) {
            firstAudio = at;
            latency.ttsFirstAudioMs = at - firstToken;
            latency.endToFirstAudioMs = at - this.lastUserSpeechEndMs;
          }
        }
      }

      if (!abort.signal.aborted && buffer.trim()) {
        const at = await this.synthesise(buffer.trim(), abort.signal);
        if (at && !firstAudio) {
          firstAudio = at;
          latency.ttsFirstAudioMs = at - firstToken;
          latency.endToFirstAudioMs = at - this.lastUserSpeechEndMs;
        }
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        this.opts.onEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    }

    if (full.trim()) this.recordPersonaTurn(full.trim());
    this.speaking = false;
    this.personaAbort = null;
    this.latencies.push(latency);
    this.opts.onEvent({ type: 'latency', latency });
    this.opts.onEvent({ type: 'persona_done', turnIndex: this.turnIndex - 1 });
  }

  /** Speak a fixed line (the opening question) without invoking the LLM. */
  private async speak(text: string, o: { isChallenge: boolean; skipLlm: boolean }): Promise<void> {
    const abort = new AbortController();
    this.personaAbort = abort;
    this.speaking = true;
    await this.synthesise(text, abort.signal);
    this.recordPersonaTurn(text, o.isChallenge);
    this.speaking = false;
    this.personaAbort = null;
  }

  private recordPersonaTurn(text: string, forceChallenge?: boolean): void {
    const isChallenge = forceChallenge ?? isChallengeTurn(text, this.opts.cfg);
    const start = this.relNow();
    const turn: Turn = {
      index: this.turnIndex++,
      speaker: 'persona',
      text,
      startMs: start,
      // Persona timings are estimated from speaking rate; only USER timings
      // feed the metrics, so estimation here is safe.
      endMs: start + Math.round(text.split(/\s+/).length * 380),
      words: [],
      isChallenge,
    };
    this.turns.push(turn);
    this.history.push({ role: 'assistant', content: text });
    this.opts.onEvent({ type: 'persona_text', turnIndex: turn.index, text, isChallenge });
  }

  /** Returns the ms timestamp of the first audio chunk, or 0 if aborted. */
  private async synthesise(text: string, signal: AbortSignal): Promise<number> {
    const { tts } = this.opts.providers;
    const voiceId = tts.voiceFor(
      this.opts.cfg.language,
      (this.opts.cfg.persona.voice[this.opts.cfg.language] ?? {}) as Record<string, string>,
    );
    let firstAt = 0;
    try {
      for await (const chunk of tts.stream({ text, language: this.opts.cfg.language, voiceId, signal })) {
        if (signal.aborted) break;
        if (!firstAt) firstAt = Date.now();
        this.opts.onEvent({ type: 'persona_audio', chunk });
      }
    } catch (err) {
      if (!signal.aborted) {
        this.opts.onEvent({ type: 'error', message: `TTS: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
    return firstAt;
  }

  /** Attach script tags to turns for the transcript record. */
  finalise(): Turn[] {
    for (const t of this.turns) {
      if (t.speaker === 'user') {
        (t as Turn & { dominantScript?: string | null }).dominantScript = dominantScript(t.text);
      }
    }
    return this.turns;
  }
}
