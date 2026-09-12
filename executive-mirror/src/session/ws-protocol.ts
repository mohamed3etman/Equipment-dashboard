/** Wire protocol between browser and session server. Kept in one file so both sides cannot drift. */
import type { Lang } from '@/lib/types';

export interface ClientHello {
  type: 'hello';
  scenarioId: string;
  personaId: string;
  language: Lang;
  sampleRate: number;
  /** Set on a retry so the persona asks the same opening question. */
  pinnedOpeningQuestionId?: string;
  focusObjective?: string;
  /** Set when this session is a re-attempt; results attach to the original. */
  retryOf?: string;
}

export type ClientMessage =
  | ClientHello
  | { type: 'end' };
// Audio travels as raw binary frames, not JSON — base64 would inflate every
// 20ms frame by a third for no benefit.

export type ServerMessage =
  | { type: 'ready'; sessionId: string; openingQuestionId: string }
  | { type: 'persona_text'; turnIndex: number; text: string; isChallenge: boolean }
  | { type: 'user_partial'; text: string }
  | { type: 'user_final'; turnIndex: number; text: string }
  | { type: 'barge_in' }
  | { type: 'latency'; endToFirstAudioMs?: number; llmFirstTokenMs?: number }
  | { type: 'analysing' }
  | { type: 'report'; sessionId: string }
  | { type: 'error'; message: string };

export const AUDIO_SAMPLE_RATE = 16000;
export const AUDIO_FRAME_MS = 20;
