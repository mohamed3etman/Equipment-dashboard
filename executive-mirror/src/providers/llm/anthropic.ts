import Anthropic from '@anthropic-ai/sdk';
import type { LlmProvider, LlmStreamOptions } from '../types';

/**
 * Anthropic adapter.
 *
 * Two roles share this class, distinguished by `effort`:
 *   - the live persona turn, where time-to-first-token dominates perceived
 *     latency (V2 §38: p50 < 1.5s), so it runs at low effort;
 *   - the analysis passes, where quality is the product, so they run at high
 *     effort with structured JSON output.
 *
 * Both default to claude-opus-5 and are overridable by environment.
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly id = 'anthropic';
  readonly modelId: string;
  private client: Anthropic;
  private effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';

  constructor(
    apiKey: string,
    opts: { modelId?: string; effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' } = {},
  ) {
    this.client = new Anthropic({ apiKey });
    this.modelId = opts.modelId ?? process.env.EM_LLM_MODEL ?? 'claude-opus-5';
    this.effort = opts.effort ?? 'low';
  }

  /** Live persona turn. Streams deltas so TTS can start at the first sentence. */
  async *stream(opts: LlmStreamOptions): AsyncIterable<string> {
    const system = opts.system
      // Pinned prefix — persona + scenario + brief. Cached so only the rolling
      // conversation is re-billed each turn. (V2 §6.6 context management)
      ? [{ type: 'text' as const, text: opts.system, cache_control: { type: 'ephemeral' as const } }]
      : undefined;

    const stream = this.client.messages.stream({
      model: this.modelId,
      max_tokens: opts.maxTokens ?? 400,        // persona turns are capped at ~3 sentences
      ...(system ? { system } : {}),
      messages: opts.messages.filter((m) => m.role !== 'system') as Anthropic.MessageParam[],
      output_config: { effort: this.effort },
    }, { signal: opts.signal });

    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    } catch (err) {
      // Barge-in aborts the stream deliberately; that is not an error.
      if (opts.signal?.aborted) return;
      throw err;
    }
  }

  /** Analysis pass. Structured JSON, temperature-free, high effort. */
  async json<T>(opts: LlmStreamOptions & { schemaHint: string }): Promise<T> {
    const system = opts.system
      ? [{ type: 'text' as const, text: opts.system, cache_control: { type: 'ephemeral' as const } }]
      : undefined;

    const stream = this.client.messages.stream({
      model: process.env.EM_ANALYSIS_MODEL ?? this.modelId,
      max_tokens: opts.maxTokens ?? 16000,
      ...(system ? { system } : {}),
      messages: opts.messages.filter((m) => m.role !== 'system') as Anthropic.MessageParam[],
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: JSON.parse(opts.schemaHint) },
      },
    } as Anthropic.MessageStreamParams, { signal: opts.signal });

    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      throw new Error(`Analysis refused: ${message.stop_details?.explanation ?? 'no explanation'}`);
    }

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Analysis pass returned unparseable JSON (first 400 chars): ${text.slice(0, 400)}`);
    }
  }
}

/** Convenience factory for the analysis role. */
export function createAnalysisProvider(apiKey: string): AnthropicLlmProvider {
  return new AnthropicLlmProvider(apiKey, {
    modelId: process.env.EM_ANALYSIS_MODEL ?? 'claude-opus-5',
    effort: 'high',
  });
}
