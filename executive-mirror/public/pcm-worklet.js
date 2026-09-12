/**
 * Captures microphone audio and emits 16 kHz mono PCM16 frames.
 *
 * A worklet rather than ScriptProcessor: ScriptProcessor runs on the main
 * thread, so a React re-render during a session would drop audio frames — the
 * exact failure that produces a transcript with holes in it.
 */
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetRate = options.processorOptions.targetRate || 16000;
    this.ratio = sampleRate / this.targetRate;
    this.acc = [];
    this.pos = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch = input[0];

    // Linear-interpolation downsample to the target rate. Adequate for speech;
    // the STT resamples again server-side anyway.
    for (let i = 0; i < ch.length; i++) this.acc.push(ch[i]);

    const out = [];
    while (this.pos + this.ratio < this.acc.length) {
      const idx = Math.floor(this.pos);
      const frac = this.pos - idx;
      const a = this.acc[idx] || 0;
      const b = this.acc[idx + 1] || a;
      out.push(a + (b - a) * frac);
      this.pos += this.ratio;
    }
    const consumed = Math.floor(this.pos);
    if (consumed > 0) { this.acc = this.acc.slice(consumed); this.pos -= consumed; }

    if (out.length > 0) {
      const pcm = new Int16Array(out.length);
      for (let i = 0; i < out.length; i++) {
        const s = Math.max(-1, Math.min(1, out[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
