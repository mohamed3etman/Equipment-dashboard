import type { LlmProvider, Providers, SttProvider, TtsProvider } from './types';
import { MockLlmProvider, MockSttProvider, MockTtsProvider } from './mock';

/**
 * Resolves providers from environment. (V2 §34, §45.7)
 * Secrets are read here and nowhere else. Missing keys degrade to mocks with a
 * loud warning rather than crashing, so the app is always runnable.
 */

export interface RegistryOptions {
  /** Force mocks regardless of environment. Used by tests and the demo runner. */
  forceMock?: boolean;
  mockSttScript?: string[];
  mockLlmTurns?: string[];
}

let warned = false;
function warnOnce(msg: string) {
  if (warned) return;
  warned = true;
  // eslint-disable-next-line no-console
  console.warn(`[executive-mirror] ${msg}`);
}

export async function resolveProviders(opts: RegistryOptions = {}): Promise<Providers> {
  const wantMock = opts.forceMock || process.env.EM_PROVIDERS === 'mock';

  if (wantMock) {
    const llm = new MockLlmProvider('mock-model-v1', opts.mockLlmTurns ?? []);
    return {
      stt: new MockSttProvider(opts.mockSttScript ?? []),
      llm,
      analysisLlm: llm,
      tts: new MockTtsProvider(),
    };
  }

  const stt = await resolveStt();
  const llm = await resolveLlm();
  const tts = await resolveTts();
  return { stt, llm, analysisLlm: llm, tts };
}

async function resolveStt(): Promise<SttProvider> {
  if (process.env.DEEPGRAM_API_KEY) {
    const { DeepgramSttProvider } = await import('./stt/deepgram');
    return new DeepgramSttProvider(process.env.DEEPGRAM_API_KEY);
  }
  warnOnce('No DEEPGRAM_API_KEY — falling back to mock STT. Voice sessions will not use real audio.');
  return new MockSttProvider();
}

async function resolveLlm(): Promise<LlmProvider> {
  if (process.env.ANTHROPIC_API_KEY) {
    const { AnthropicLlmProvider } = await import('./llm/anthropic');
    return new AnthropicLlmProvider(process.env.ANTHROPIC_API_KEY);
  }
  warnOnce('No ANTHROPIC_API_KEY — falling back to mock LLM. Persona and analysis will be scripted.');
  return new MockLlmProvider();
}

async function resolveTts(): Promise<TtsProvider> {
  if (process.env.ELEVENLABS_API_KEY) {
    const { ElevenLabsTtsProvider } = await import('./tts/elevenlabs');
    return new ElevenLabsTtsProvider(process.env.ELEVENLABS_API_KEY);
  }
  warnOnce('No ELEVENLABS_API_KEY — falling back to mock TTS (silence).');
  return new MockTtsProvider();
}
