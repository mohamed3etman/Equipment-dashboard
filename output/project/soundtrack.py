"""
Coffee Time — original soundtrack & sound design (fully synthesised, royalty-free).

100 BPM, D major, 11 bars + tail (27.0 s).  Every structural moment lands on
the same beat grid the edit uses (beat = 0.6 s, bar = 2.4 s):

  0.0 – 4.8   ambient room tone + pad swell + sparse piano, ceramic "tink"
  3.6         whoosh  (zoom-through transition)
  4.8 – 12.0  piano arpeggios, warm pad, soft pulse
  12.0 – 14.4 build: kick, hats, riser, snare roll
  14.4        IMPACT  (emotional peak, "ثم عُد أقوى")
  14.4 – 21.6 full groove: kick / clap / bass / string ostinato / melody
  20.4        swell + whoosh into the end card
  21.6 – 27.0 resolution: drums drop, G → A → D(add9), long reverb tail

Usage:  python3 soundtrack.py <ambient_wav_or_none> <out.wav>
"""
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 48000
DUR = 27.0
BPM = 100
BEAT = 60.0 / BPM          # 0.6 s
BAR = 4 * BEAT             # 2.4 s
N = int(SR * DUR)
rng = np.random.default_rng(7)


def t_axis(n):
    return np.arange(n) / SR


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}


def m(name):  # "F#5" -> midi
    p, o = name[:-1], int(name[-1])
    return 12 * (o + 1) + NOTE[p]


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


class Bus:
    def __init__(self):
        self.L = np.zeros(N + SR * 4)
        self.R = np.zeros(N + SR * 4)

    def add(self, sig, t0, gain=1.0, pan=0.0):
        i = int(t0 * SR)
        if i < 0:
            sig = sig[-i:]
            i = 0
        n = min(len(sig), len(self.L) - i)
        if n <= 0:
            return
        gl = gain * np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
        gr = gain * np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
        self.L[i:i + n] += sig[:n] * gl
        self.R[i:i + n] += sig[:n] * gr

    def stereo(self):
        return np.stack([self.L[:N], self.R[:N]], 1)


# ---------------------------------------------------------------- instruments
def piano(midi, dur=2.5, vel=0.8):
    f0 = midi_hz(midi)
    n = int(SR * (dur + 1.5))
    t = t_axis(n)
    out = np.zeros(n)
    B = 0.00012  # slight inharmonicity
    for k in range(1, 11):
        fk = f0 * k * np.sqrt(1 + B * k * k)
        if fk > 16000:
            break
        amp = (1.0 / k ** 1.25) * (1.0 if k == 1 else 0.85)
        dec = 1.2 + 0.55 * k * (f0 / 300.0) ** 0.5
        out += amp * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * np.exp(-dec * t / (dur / 2.2))
    att = np.minimum(1, t / 0.004)
    rel = np.clip((dur + 1.5 - t) / 1.2, 0, 1)
    hammer = lp(rng.standard_normal(n) * np.exp(-t * 180), 3000) * 0.25
    s = (out * att * rel + hammer) * vel
    # brighter for higher velocity
    return lp(s, 2500 + 5000 * vel)


def saw(f, t):
    ph = (f * t) % 1.0
    return 2 * ph - 1


def pad(midis, dur, attack=1.2, release=1.5, bright=1800, detune=0.12):
    n = int(SR * (dur + release))
    t = t_axis(n)
    s = np.zeros(n)
    for md in midis:
        f = midi_hz(md)
        for d in (-detune, 0, detune):
            s += saw(f * 2 ** (d / 12), t + rng.uniform(0, 1))
    s /= max(1, len(midis) * 3)
    env = np.minimum(1, t / attack) * np.clip((dur + release - t) / release, 0, 1)
    env = np.minimum(env, np.where(t < dur, 1, np.clip(1 - (t - dur) / release, 0, 1)))
    s = lp(s, bright, 4) * env
    # slow tremolo for life
    s *= 1 + 0.06 * np.sin(2 * np.pi * 0.23 * t)
    return s


def strings_ostinato(midis, dur, step=BEAT / 2):
    """8th-note pulsed strings."""
    n = int(SR * (dur + 0.6))
    t = t_axis(n)
    base = pad(midis, dur + 0.3, attack=0.02, release=0.3, bright=3200, detune=0.08)
    n = min(n, len(base)); base = base[:n]; t = t[:n]
    ph = (t % step) / step
    gate = np.exp(-ph * 3.2) * 0.85 + 0.15
    return base * gate


def bass(midi, dur):
    n = int(SR * (dur + 0.3))
    t = t_axis(n)
    f = midi_hz(midi)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    env = np.minimum(1, t / 0.01) * np.clip((dur + 0.3 - t) / 0.3, 0, 1) * (0.75 + 0.25 * np.exp(-t * 3))
    return lp(s * env, 900)


def kick(vel=1.0):
    n = int(SR * 0.6)
    t = t_axis(n)
    f = 45 + 95 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 6.5)
    click = hp(rng.standard_normal(n) * np.exp(-t * 400), 2000) * 0.15
    return np.tanh((body + click) * 1.4) * vel


def clap(vel=1.0):
    n = int(SR * 0.5)
    t = t_axis(n)
    env = np.zeros(n)
    for d in (0, 0.011, 0.022):
        env += np.exp(-np.clip(t - d, 0, None) * 60) * (t >= d)
    env += 0.4 * np.exp(-t * 14)
    return bp(rng.standard_normal(n), 900, 5000) * env * 0.5 * vel


def hat(vel=1.0, open_=False):
    n = int(SR * (0.35 if open_ else 0.08))
    t = t_axis(n)
    return hp(rng.standard_normal(n), 7000, 4) * np.exp(-t * (12 if open_ else 70)) * vel * 0.35


def riser(dur):
    n = int(SR * dur)
    t = t_axis(n)
    x = t / dur
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    # sweep a band-pass by processing in chunks
    chunk = 2048
    for i in range(0, n, chunk):
        c = x[min(i, n - 1)]
        lo = 300 + 5000 * c ** 2
        out[i:i + chunk] = bp(noise[i:i + chunk], lo, min(lo * 2.2, 20000))
    tone_f = 220 * 2 ** (2 * x)
    tone = np.sin(2 * np.pi * np.cumsum(tone_f) / SR) * 0.15
    return (out * 0.6 + tone) * x ** 2.2


def whoosh(dur=0.9, up=True):
    n = int(SR * dur)
    t = t_axis(n)
    x = t / dur
    env = np.sin(np.pi * x) ** 2
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    chunk = 1024
    for i in range(0, n, chunk):
        c = x[min(i, n - 1)]
        c = c if up else 1 - c
        lo = 250 + 3500 * c
        out[i:i + chunk] = bp(noise[i:i + chunk], lo, lo * 1.9)
    return out * env


def impact():
    n = int(SR * 3.0)
    t = t_axis(n)
    boom = np.sin(2 * np.pi * np.cumsum(38 + 50 * np.exp(-t * 9)) / SR) * np.exp(-t * 1.6)
    crack = lp(rng.standard_normal(n), 2500) * np.exp(-t * 18) * 0.5
    return np.tanh((boom + crack) * 1.6)


def tink():
    """Small ceramic cup 'tink' — inharmonic partials, short decay."""
    n = int(SR * 1.6)
    t = t_axis(n)
    s = np.zeros(n)
    for f, a, d in [(2310, 1.0, 5.0), (3790, 0.6, 7.0), (5480, 0.35, 9.0), (7240, 0.18, 12.0), (1180, 0.25, 6.0)]:
        s += a * np.sin(2 * np.pi * f * t) * np.exp(-d * t)
    return s * np.minimum(1, t / 0.001) * 0.35


def reverb_ir(seconds=2.4, damp=5200):
    n = int(SR * seconds)
    t = t_axis(n)
    irs = []
    for _ in range(2):
        e = rng.standard_normal(n) * np.exp(-t * 6.9 / seconds)
        e = lp(e, damp)
        e[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        irs.append(e / np.sqrt(np.sum(e ** 2)))
    return irs


def apply_reverb(st, wet=0.3, seconds=2.4):
    irL, irR = reverb_ir(seconds)
    wl = fftconvolve(st[:, 0], irL)[: len(st)]
    wr = fftconvolve(st[:, 1], irR)[: len(st)]
    return st * (1 - wet * 0.4) + np.stack([wl, wr], 1) * wet


# ---------------------------------------------------------------- arrangement
def bar_t(b, beat=0.0):   # bar index 1-based
    return (b - 1) * BAR + beat * BEAT


CH = {  # voicings
    'Dadd9': ['D3', 'A3', 'E4', 'F#4'],
    'D': ['D3', 'A3', 'D4', 'F#4'],
    'A/C#': ['C#3', 'A3', 'C#4', 'E4'],
    'Bm7': ['B2', 'F#3', 'A3', 'D4'],
    'Gmaj7': ['G2', 'D3', 'F#3', 'B3'],
    'A': ['A2', 'E3', 'A3', 'C#4'],
    'Asus4': ['A2', 'E3', 'A3', 'D4'],
    'G': ['G2', 'D3', 'G3', 'B3'],
}
ROOT = {'Dadd9': 'D2', 'D': 'D2', 'A/C#': 'C#2', 'Bm7': 'B1', 'Gmaj7': 'G1', 'A': 'A1', 'Asus4': 'A1', 'G': 'G1'}
PROG = {1: 'Dadd9', 2: 'Dadd9', 3: 'D', 4: 'A/C#', 5: 'Bm7', 6: 'Gmaj7', 7: 'D', 8: 'A', 9: 'Bm7', 10: 'G', 11: 'Dadd9'}


def build(ambient_path=None):
    piano_bus, pad_bus, drum_bus, fx_bus, str_bus, bass_bus = Bus(), Bus(), Bus(), Bus(), Bus(), Bus()

    # -- ambient room tone (the clips' own recorded atmosphere), intro only
    amb_bus = Bus()
    if ambient_path and ambient_path != 'none':
        sr, a = wavfile.read(ambient_path)
        a = a.astype(np.float64) / 32768.0
        if a.ndim == 1:
            a = np.stack([a, a], 1)
        a = hp(a.T, 120).T
        rms = np.sqrt(np.mean(a ** 2)) + 1e-9
        a = a / rms * 0.010
        reps = int(np.ceil(N / len(a))) + 1
        a = np.tile(a, (reps, 1))[:N]
        env = np.interp(t_axis(N), [0, 0.4, 7, 12, 20.4, 22, 27], [0, 1, 1, 0.35, 0.35, 0.8, 0.0])
        amb_bus.L[:N] += a[:, 0] * env
        amb_bus.R[:N] += a[:, 1] * env

    # -- pads (whole piece)
    for b in range(1, 12):
        name = PROG[b]
        dur = BAR + (2.6 if b == 11 else 0.15)
        if b == 10:
            pad_bus.add(pad([m(x) for x in CH['G']], BEAT * 2, attack=0.4), bar_t(10), 0.55)
            pad_bus.add(pad([m(x) for x in CH['Asus4']], BEAT, attack=0.2), bar_t(10, 2), 0.55)
            pad_bus.add(pad([m(x) for x in CH['A']], BEAT, attack=0.2), bar_t(10, 3), 0.55)
            continue
        att = 2.0 if b == 1 else 0.6
        g = 0.42 if b <= 2 else (0.5 if b <= 6 else 0.6)
        if b == 11:
            g = 0.6
        pad_bus.add(pad([m(x) for x in CH[name]] + [m(x) + 12 for x in CH[name][2:]], dur, attack=att,
                        bright=1400 if b <= 6 else 2400), bar_t(b), g)

    # -- piano
    # intro: sparse high notes
    for (tt, nn, v) in [(0.6, 'F#5', 0.45), (1.8, 'A5', 0.4), (3.0, 'E5', 0.42), (4.2, 'D5', 0.4)]:
        piano_bus.add(piano(m(nn), 3.0, v), tt, 0.9, pan=0.15)
    # arpeggios bars 3-6
    arp_pat = [0, 2, 3, 1, 3, 2, 3, 1]
    for b in range(3, 7):
        notes = [m(x) + 12 for x in CH[PROG[b]]]
        for i in range(8):
            v = 0.42 + (0.1 if i % 2 == 0 else 0) + 0.04 * (b - 3)
            piano_bus.add(piano(notes[arp_pat[i]], 1.4, v), bar_t(b, i * 0.5), 0.8, pan=-0.2 + 0.4 * (i % 2))
    # peak bars 7-10: chords on beats + melody
    for b in range(7, 10):
        notes = [m(x) + 12 for x in CH[PROG[b]]]
        for beat in (0, 1.5, 2.5):
            for k, nn in enumerate(notes[1:]):
                piano_bus.add(piano(nn, 1.2, 0.5), bar_t(b, beat) + 0.006 * k, 0.55, pan=-0.1)
    melody = [(7, 0, 'F#5', 1.5), (7, 1.5, 'A5', 1.0), (7, 2.5, 'E5', 1.5),
              (8, 0, 'E5', 1.5), (8, 1.5, 'C#5', 1.0), (8, 2.5, 'A5', 1.5),
              (9, 0, 'F#5', 1.5), (9, 1.5, 'D5', 1.0), (9, 2.5, 'B4', 1.5),
              (10, 0, 'D5', 2.0), (10, 2.0, 'E5', 2.0)]
    for (b, beat, nn, d) in melody:
        piano_bus.add(piano(m(nn), d * BEAT + 0.8, 0.78), bar_t(b, beat), 0.85, pan=0.1)
        piano_bus.add(piano(m(nn) + 12, d * BEAT + 0.6, 0.45), bar_t(b, beat) + 0.004, 0.3, pan=0.25)
    # resolution: rolled D add9 chord + final high note
    final = ['D2', 'A2', 'D3', 'A3', 'E4', 'F#4', 'A4', 'D5']
    for k, nn in enumerate(final):
        piano_bus.add(piano(m(nn), 5.5, 0.55), bar_t(11) + 0.045 * k, 0.42, pan=-0.3 + 0.08 * k)
    piano_bus.add(piano(m('F#5'), 4.0, 0.45), bar_t(11, 2), 0.45, pan=0.2)

    # -- strings ostinato bars 7-10
    for b in range(7, 11):
        name = PROG[b]
        notes = [m(x) + 12 for x in CH[name if b != 10 else 'G']]
        str_bus.add(strings_ostinato(notes, BAR), bar_t(b), 0.42, pan=0.0)
    # sustained high strings on resolution
    str_bus.add(pad([m('A4'), m('D5'), m('F#5')], 5.0, attack=0.8, release=2.0, bright=3000, detune=0.06),
                bar_t(11), 0.3)

    # -- bass bars 5-10 (gentle in 5-6, full 7-10) + final
    for b in range(5, 11):
        r = m(ROOT[PROG[b]])
        if b <= 6:
            bass_bus.add(bass(r, BAR - 0.05), bar_t(b), 0.35)
        else:
            for beat in (0, 1.5, 2.5, 3.5):
                bass_bus.add(bass(r if beat != 3.5 else r + 12, 0.55 if beat == 3.5 else 0.85), bar_t(b, beat), 0.55)
    bass_bus.add(bass(m('D2'), 4.5), bar_t(11), 0.5)

    # -- drums
    # build bar 6: kick on 1 & 3, hats 8ths crescendo, snare roll last 2 beats
    for i in range(4):
        if i in (0, 2):
            drum_bus.add(kick(0.55), bar_t(6, i), 0.8)
    for i in range(8):
        drum_bus.add(hat(0.4 + 0.07 * i), bar_t(6, i * 0.5), 0.6, pan=0.3)
    roll = [(2.0 + k * 0.25, 0.25 + 0.06 * k) for k in range(4)] + [(3.0 + k * 0.125, 0.45 + 0.07 * k) for k in range(8)]
    for (beat, v) in roll:
        drum_bus.add(clap(v), bar_t(6, beat), 0.55, pan=-0.1)
    # groove bars 7-9 + bar 10 first half
    for b in range(7, 11):
        nbeats = 4 if b < 10 else 2
        for i in range(nbeats):
            drum_bus.add(kick(0.95), bar_t(b, i), 0.9)
            if i % 2 == 1:
                drum_bus.add(clap(0.8), bar_t(b, i), 0.6, pan=-0.05)
        for i in range(nbeats * 2):
            drum_bus.add(hat(0.55 if i % 2 else 0.35, open_=(i % 2 == 1)), bar_t(b, i * 0.5), 0.55, pan=0.3)

    # -- fx
    fx_bus.add(tink(), 0.35, 0.55, pan=0.25)
    fx_bus.add(whoosh(1.0, True), 3.6 - 0.62, 0.32, pan=-0.2)
    fx_bus.add(whoosh(0.8, False), 8.4 - 0.4, 0.12, pan=0.2)
    for tc in (12.0, 12.6, 13.2, 13.8):          # subtle tick on montage cuts
        fx_bus.add(whoosh(0.25, True), tc - 0.14, 0.12, pan=0.0)
    fx_bus.add(riser(3.0), 14.4 - 3.0, 0.38)
    fx_bus.add(impact(), 14.4, 0.85)
    fx_bus.add(whoosh(1.4, False), 20.4 - 0.7, 0.28, pan=0.15)
    fx_bus.add(tink(), 21.65, 0.35, pan=-0.2)

    # -- mix
    pianos = apply_reverb(piano_bus.stereo(), wet=0.38, seconds=2.6)
    pads = apply_reverb(pad_bus.stereo(), wet=0.45, seconds=3.2)
    strs = apply_reverb(str_bus.stereo(), wet=0.35, seconds=2.2)
    drums = apply_reverb(drum_bus.stereo(), wet=0.12, seconds=1.2)
    fx = apply_reverb(fx_bus.stereo(), wet=0.35, seconds=2.8)
    bs = bass_bus.stereo()
    amb = amb_bus.stereo()

    # sidechain-style ducking of pads/strings on kicks in the groove
    t = t_axis(N)
    duck = np.ones(N)
    for b in range(7, 11):
        for i in range(4 if b < 10 else 2):
            t0 = bar_t(b, i)
            sel = (t >= t0) & (t < t0 + 0.35)
            duck[sel] = np.minimum(duck[sel], 0.72 + 0.28 * ((t[sel] - t0) / 0.35))
    duck = duck[:, None]

    mix = (pianos * 0.9 + pads * 0.55 * duck + strs * 0.6 * duck + drums * 0.75 + bs * 0.7 + fx * 0.8 + amb)

    # global dynamics curve (calm -> uplifting -> resolve) and final fade
    shape = np.interp(t, [0, 4.8, 12.0, 14.4, 21.6, 25.5, 27.0], [0.72, 0.8, 0.9, 1.0, 0.95, 0.85, 0.0])
    fade_in = np.minimum(1, t / 0.25)
    mix *= (shape * fade_in)[:, None]

    # gentle master: low-cut, glue, soft limit
    mix = hp(mix.T, 30).T
    peak_target = 10 ** (-1.0 / 20)
    rms = np.sqrt(np.mean(mix ** 2))
    mix *= (10 ** (-15.5 / 20)) / rms          # ~ -15.5 dBFS RMS loudness ballpark
    mix = np.tanh(mix * 1.15) / 1.15
    mix *= peak_target / max(peak_target, np.max(np.abs(mix)))
    return mix


if __name__ == '__main__':
    amb = sys.argv[1] if len(sys.argv) > 1 else 'none'
    out = sys.argv[2] if len(sys.argv) > 2 else 'soundtrack.wav'
    mix = build(amb)
    wavfile.write(out, SR, (mix * 32767).astype(np.int16))
    print('wrote', out, mix.shape, 'peak', np.max(np.abs(mix)))
