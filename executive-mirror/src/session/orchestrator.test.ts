import { describe, it, expect } from 'vitest';
import { extractSentence, SessionOrchestrator, type OrchestratorEvent } from './orchestrator';
import { loadSessionConfig } from '@/config/loader';
import { MockLlmProvider, MockSttProvider, MockTtsProvider, synthesiseWords } from '@/providers/mock';
import type { Providers } from '@/providers/types';

describe('sentence splitting for early TTS', () => {
  it('splits at an English terminator', () => {
    const r = extractSentence('That is not what I asked. Try again');
    expect(r?.sentence).toBe('That is not what I asked.');
    expect(r?.rest).toBe('Try again');
  });

  it('splits at an Arabic question mark', () => {
    const r = extractSentence('لماذا يجب أن أصدق هذا الرقم؟ أعطني الأساس');
    expect(r?.sentence).toBe('لماذا يجب أن أصدق هذا الرقم؟');
  });

  it('does not split on a short fragment', () => {
    expect(extractSentence('Fine. ')).toBeNull();
  });

  it('returns null when no terminator is present', () => {
    expect(extractSentence('I asked what you decided')).toBeNull();
  });
});

function makeProviders(personaTurns: string[]): Providers {
  const llm = new MockLlmProvider('mock', personaTurns);
  return { stt: new MockSttProvider(), llm, analysisLlm: llm, tts: new MockTtsProvider() };
}

describe('orchestrator', () => {
  it('opens with a scenario question before the user says anything', async () => {
    const cfg = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', 'en');
    const events: OrchestratorEvent[] = [];
    const o = new SessionOrchestrator({
      cfg, providers: makeProviders([]), onEvent: (e) => events.push(e),
    });
    await o.start();

    const first = events.find((e) => e.type === 'persona_text');
    expect(first).toBeDefined();
    const opening = cfg.scenario.opening_questions.en.map((q) => q.text.trim());
    expect(opening.some((t) => t.includes((first as { text: string }).text.slice(0, 30)))).toBe(true);
  });

  it('pins the opening question so a retry asks the same thing', async () => {
    const cfg = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', 'en');
    const o = new SessionOrchestrator({
      cfg, providers: makeProviders([]), pinnedOpeningQuestionId: 'en_priority', onEvent: () => {},
    });
    expect(o.openingQuestionId).toBe('en_priority');
  });

  it('records a user turn and produces a persona reply with latency captured', async () => {
    const cfg = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', 'en');
    const events: OrchestratorEvent[] = [];
    const o = new SessionOrchestrator({
      cfg, providers: makeProviders(['I asked what you decided, not how you did it.']),
      onEvent: (e) => events.push(e),
    });
    await o.start();

    const text = 'We mapped the workflow and ran improvement cycles across the group';
    await o.onUserUtterance(text, synthesiseWords(text, 5000), Date.now());

    const turns = o.transcriptTurns;
    expect(turns.filter((t) => t.speaker === 'user')).toHaveLength(1);
    expect(turns.filter((t) => t.speaker === 'persona').length).toBeGreaterThanOrEqual(2);

    const lat = o.turnLatencies;
    expect(lat).toHaveLength(1);
    expect(lat[0]!.llmFirstTokenMs).toBeGreaterThanOrEqual(0);
    expect(lat[0]!.endToFirstAudioMs).toBeGreaterThanOrEqual(0);
  });

  it('tags challenge turns drawn from the challenge bank', async () => {
    const cfg = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', 'en');
    const o = new SessionOrchestrator({
      cfg, providers: makeProviders(['Why should I believe that number? Give me the baseline.']),
      onEvent: () => {},
    });
    await o.start();
    const t = 'We improved it substantially';
    await o.onUserUtterance(t, synthesiseWords(t, 5000), Date.now());

    const challenge = o.transcriptTurns.find((x) => x.speaker === 'persona' && x.isChallenge);
    expect(challenge).toBeDefined();
  });

  it('marks the language of a code-switched user turn without erroring', async () => {
    const cfg = loadSessionConfig('executive-interview', 'skeptical-executive-interviewer', 'ar');
    const o = new SessionOrchestrator({ cfg, providers: makeProviders(['طيب.']), onEvent: () => {} });
    await o.start();
    const t = 'طبقنا الـ governance framework على مستوى المجموعة';
    await o.onUserUtterance(t, synthesiseWords(t, 5000), Date.now());

    const turns = o.finalise();
    const user = turns.find((x) => x.speaker === 'user') as { dominantScript?: string | null };
    expect(user.dominantScript).toBe('arabic');
  });
});
