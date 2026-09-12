/**
 * WebSocket adapter for the session orchestrator.
 *
 * Responsibilities are deliberately narrow: translate frames to orchestrator
 * calls and orchestrator events to frames. All conversation logic lives in the
 * orchestrator so it stays testable without a socket.
 */
import type { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { loadSessionConfig, type SessionConfig } from '@/config/loader';
import { resolveProviders } from '@/providers/registry';
import { analyseSession } from '@/analysis/pipeline';
import { SessionOrchestrator } from './orchestrator';
import type { ClientMessage, ServerMessage } from './ws-protocol';
import type { Providers, SttSession } from '@/providers/types';
import type { Transcript } from '@/lib/types';

export function attachSessionSocket(ws: WebSocket): void {
  const sessionId = randomUUID();
  let orchestrator: SessionOrchestrator | null = null;
  let stt: SttSession | null = null;
  let closed = false;
  // Held from `hello` so analysis uses the session's ACTUAL scenario, persona
  // and language. Reloading a default here would analyse an Arabic session
  // against the English rubric.
  let cfg: SessionConfig | null = null;
  let providers: Providers | null = null;

  const send = (m: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
  };
  const sendAudio = (chunk: Uint8Array) => {
    if (ws.readyState === ws.OPEN) ws.send(chunk, { binary: true });
  };

  ws.on('message', async (data, isBinary) => {
    if (closed) return;

    // Binary frames are audio; everything else is control JSON.
    if (isBinary) {
      if (orchestrator && stt) {
        orchestrator.pushAudio(new Uint8Array(data as Buffer), stt);
      }
      return;
    }

    let msg: ClientMessage;
    try { msg = JSON.parse(data.toString()) as ClientMessage; }
    catch { send({ type: 'error', message: 'malformed control message' }); return; }

    if (msg.type === 'hello') {
      try {
        cfg = loadSessionConfig(msg.scenarioId, msg.personaId, msg.language);
        providers = await resolveProviders();

        orchestrator = new SessionOrchestrator({
          cfg,
          providers,
          focusObjective: msg.focusObjective,
          pinnedOpeningQuestionId: msg.pinnedOpeningQuestionId,
          onEvent: (e) => {
            switch (e.type) {
              case 'persona_text':
                send({ type: 'persona_text', turnIndex: e.turnIndex, text: e.text, isChallenge: e.isChallenge });
                break;
              case 'persona_audio': sendAudio(e.chunk); break;
              case 'user_partial': send({ type: 'user_partial', text: e.text }); break;
              case 'user_final': send({ type: 'user_final', turnIndex: e.turn.index, text: e.turn.text }); break;
              case 'barge_in': send({ type: 'barge_in' }); break;
              case 'latency':
                send({
                  type: 'latency',
                  endToFirstAudioMs: e.latency.endToFirstAudioMs,
                  llmFirstTokenMs: e.latency.llmFirstTokenMs,
                });
                break;
              case 'error': send({ type: 'error', message: e.message }); break;
              default: break;
            }
          },
        });

        stt = await providers.stt.open({
          language: msg.language,
          sampleRate: msg.sampleRate,
          endpointingMs: 900,
          // Code-switching must not corrupt the transcript. (V2 §3.3)
          multilingual: true,
        });

        stt.on((ev) => {
          if (!orchestrator) return;
          if (ev.type === 'partial') send({ type: 'user_partial', text: ev.text });
          else if (ev.type === 'final') void orchestrator.onUserUtterance(ev.text, ev.words, ev.emittedAt);
        });

        send({ type: 'ready', sessionId, openingQuestionId: orchestrator.openingQuestionId });
        await orchestrator.start();
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (msg.type === 'end') {
      closed = true;
      await stt?.close().catch(() => {});
      if (!orchestrator) { ws.close(); return; }

      if (!cfg || !providers) { send({ type: 'error', message: 'session was never initialised' }); ws.close(); return; }

      send({ type: 'analysing' });
      try {
        const transcript: Transcript = {
          sessionId,
          language: cfg.language,
          turns: orchestrator.finalise(),
        };
        await analyseSession(transcript, cfg, providers.analysisLlm);
        send({ type: 'report', sessionId });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      }
      ws.close();
    }
  });

  ws.on('close', () => { closed = true; void stt?.close().catch(() => {}); });
  ws.on('error', () => { closed = true; void stt?.close().catch(() => {}); });
}
