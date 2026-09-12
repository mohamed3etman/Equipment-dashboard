/**
 * Browser side of the live session.
 *
 * Owns: microphone capture at 16 kHz PCM16, the control socket, and queued
 * playback of persona audio. Deliberately has no UI concerns — the session
 * page subscribes to callbacks.
 */
import type { ClientHello, ServerMessage } from '@/session/ws-protocol';
import { AUDIO_SAMPLE_RATE } from '@/session/ws-protocol';

export interface VoiceClientHandlers {
  onServerMessage: (m: ServerMessage) => void;
  onLevel?: (rms: number) => void;
  onClose?: () => void;
}

export class VoiceClient {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private playbackCtx: AudioContext | null = null;
  private playAt = 0;

  constructor(private handlers: VoiceClientHandlers) {}

  async connect(hello: Omit<ClientHello, 'type' | 'sampleRate'>): Promise<void> {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/session`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Could not reach the session server. Is it running with `npm run dev:live`?'));
    });

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        this.handlers.onServerMessage(JSON.parse(ev.data) as ServerMessage);
      } else {
        void this.enqueueAudio(ev.data as ArrayBuffer);
      }
    };
    ws.onclose = () => this.handlers.onClose?.();

    ws.send(JSON.stringify({ ...hello, type: 'hello', sampleRate: AUDIO_SAMPLE_RATE } satisfies ClientHello));
    await this.startCapture();
  }

  private async startCapture(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,   // required — the persona's voice is on the speakers
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    const ctx = new AudioContext();
    this.ctx = ctx;
    await ctx.audioWorklet.addModule('/pcm-worklet.js');

    const src = ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(ctx, 'pcm-capture', {
      processorOptions: { targetRate: AUDIO_SAMPLE_RATE },
    });
    this.node = node;

    node.port.onmessage = (e) => {
      const buf = e.data as ArrayBuffer;
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(buf);
      if (this.handlers.onLevel) {
        const pcm = new Int16Array(buf);
        let sum = 0;
        for (let i = 0; i < pcm.length; i++) sum += pcm[i]! * pcm[i]!;
        this.handlers.onLevel(Math.sqrt(sum / Math.max(1, pcm.length)) / 32768);
      }
    };

    src.connect(node);
    // The worklet must be pulled by the graph to run, but must not be audible.
    const silent = ctx.createGain();
    silent.gain.value = 0;
    node.connect(silent).connect(ctx.destination);
  }

  /**
   * Queue persona audio so consecutive chunks play gaplessly.
   * Scheduling against the AudioContext clock rather than firing on arrival
   * avoids the clicks and overlaps you get from naive `new Audio()` per chunk.
   */
  private async enqueueAudio(buf: ArrayBuffer): Promise<void> {
    if (!this.playbackCtx) this.playbackCtx = new AudioContext();
    const ctx = this.playbackCtx;
    try {
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      const now = ctx.currentTime;
      this.playAt = Math.max(this.playAt, now);
      src.start(this.playAt);
      this.playAt += decoded.duration;
    } catch {
      // A partial chunk that is not independently decodable is skipped rather
      // than stalling the stream.
    }
  }

  /** Barge-in and end-of-session both need playback to stop immediately. */
  stopPlayback(): void {
    void this.playbackCtx?.close().catch(() => {});
    this.playbackCtx = null;
    this.playAt = 0;
  }

  end(): void {
    this.ws?.send(JSON.stringify({ type: 'end' }));
  }

  dispose(): void {
    this.stopPlayback();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.ws?.close();
  }
}
