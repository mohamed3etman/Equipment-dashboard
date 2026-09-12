import type { TtsOptions, TtsProvider } from '../types';
import type { Lang } from '@/lib/types';

/**
 * ElevenLabs streaming TTS.
 *
 * Chosen because persona credibility depends on prosody: a flat voice removes
 * the pressure the scenario exists to create. Flash-tier models are used for
 * the latency budget in V2 §38.
 *
 * Voice IDs are configured per language via environment, so swapping an Arabic
 * voice never requires a code change.
 */
export class ElevenLabsTtsProvider implements TtsProvider {
  readonly id = 'elevenlabs';
  readonly supportsLanguages: Lang[] = ['en', 'ar'];
  readonly outputFormat = 'mp3' as const;

  constructor(
    private apiKey: string,
    private modelId = process.env.EM_TTS_MODEL ?? 'eleven_flash_v2_5',
  ) {}

  voiceFor(language: Lang, spec: Record<string, string>): string {
    const envKey = language === 'ar' ? 'EM_TTS_VOICE_AR' : 'EM_TTS_VOICE_EN';
    const configured = process.env[envKey];
    if (configured) return configured;
    // Fall back to a persona-declared voice id if one was set in config.
    return spec.voice_id ?? '';
  }

  async *stream(opts: TtsOptions): AsyncIterable<Uint8Array> {
    if (!opts.voiceId) {
      throw new Error(
        `No TTS voice configured for '${opts.language}'. Set EM_TTS_VOICE_${opts.language.toUpperCase()}.`,
      );
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}/stream?output_format=mp3_22050_32`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: opts.text,
        model_id: this.modelId,
        voice_settings: { stability: 0.45, similarity_boost: 0.75, speed: 1.0 },
      }),
      signal: opts.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (opts.signal?.aborted) break;   // barge-in
        if (value) yield value;
      }
    } finally {
      // Cancelling the reader is what actually stops billing on barge-in.
      await reader.cancel().catch(() => {});
    }
  }
}
