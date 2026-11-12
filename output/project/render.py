"""
Coffee Time — cinematic 9:16 edit.  Frame-accurate compositor (NumPy + OpenCV + Pillow/RAQM).

Inputs (see prepare.sh):
  work/IMG_9870_sdr.mp4, work/IMG_9871_sdr.mp4, work/IMG_9872_sdr.mp4   tone-mapped SDR clips
  assets/poster.jpg   (the supplied "وقت القهوة" design)   assets/macro.jpg (crema close-up still)
  assets/fonts/*.woff   work/soundtrack.wav

Usage: python3 render.py <workdir> <assetsdir> <out.mp4> [--preview] [--frames t1,t2,...]
"""
import os
import sys
import subprocess
import multiprocessing as mp
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS, DUR = 1080, 1920, 30, 27.0
NF = int(round(DUR * FPS))
BEAT = 0.6

WORK, ASSETS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
PREVIEW = '--preview' in sys.argv
FRAMES_ONLY = None
if '--frames' in sys.argv:
    FRAMES_ONLY = [float(x) for x in sys.argv[sys.argv.index('--frames') + 1].split(',')]

ESPRESSO = np.array([58, 38, 27], np.float32) / 255
GOLD = np.array([197, 171, 128], np.float32) / 255
CREAM = np.array([250, 244, 234], np.float32) / 255


# ------------------------------------------------------------------ easing
def clamp01(x):
    return min(1.0, max(0.0, x))


def seg(t, a, b):
    return clamp01((t - a) / (b - a))


def smooth(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = clamp01(x)
    return 1 - (1 - x) ** 3


def ease_in(x):
    x = clamp01(x)
    return x ** 3


def lerp(a, b, x):
    return a + (b - a) * x


# ------------------------------------------------------------------ sources
def load_clip(path):
    cap = cv2.VideoCapture(path)
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
    return np.stack(frames)


print('loading sources...', flush=True)
CLIPS = {n: load_clip(os.path.join(WORK, f'IMG_{n}_sdr.mp4')) for n in ('9870', '9871', '9872')}
MACRO = cv2.cvtColor(cv2.imread(os.path.join(ASSETS, 'macro.jpg')), cv2.COLOR_BGR2RGB)
POSTER = cv2.cvtColor(cv2.imread(os.path.join(ASSETS, 'poster.jpg')), cv2.COLOR_BGR2RGB)
POSTER_CLEAN = cv2.cvtColor(cv2.imread(os.path.join(WORK, 'poster_clean.png')), cv2.COLOR_BGR2RGB)
ALIGN = np.load(os.path.join(WORK, 'align.npy'))   # video(9872) -> poster pixel affine


def clip_frame(name, src_t):
    c = CLIPS[name]
    x = np.clip(src_t * FPS, 0, len(c) - 1.001)
    i = int(x)
    a = x - i
    if a < 0.02:
        return c[i]
    return cv2.addWeighted(c[i], 1 - a, c[i + 1], a, 0)


# ------------------------------------------------------------------ geometry
def cover_matrix(w, h, z=1.0, cx=0.5, cy=0.5, dx=0.0, dy=0.0, rot=0.0):
    s = max(W / w, H / h) * z
    tx = W / 2 - s * cx * w
    ty = H / 2 - s * cy * h
    # keep the frame covered
    tx = min(0.0, max(W - s * w, tx)) + dx
    ty = min(0.0, max(H - s * h, ty)) + dy
    M = np.array([[s, 0, tx], [0, s, ty]], np.float64)
    if rot:
        R = cv2.getRotationMatrix2D((W / 2, H / 2), rot, 1.0)
        M = R @ np.vstack([M, [0, 0, 1]])
    return M


def warp(img, M):
    interp = cv2.INTER_AREA if M[0, 0] < 0.75 else cv2.INTER_CUBIC
    if M[0, 0] < 0.75:
        # pre-shrink for clean downsampling
        f = M[0, 0] * 1.25
        small = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        M = M.copy()
        M[:, :2] /= f
        img = small
        interp = cv2.INTER_CUBIC
    return cv2.warpAffine(img, M, (W, H), flags=interp, borderMode=cv2.BORDER_REFLECT)


# ------------------------------------------------------------------ grade
def wb_gains(img_u8, target=(1.0, 0.978, 0.944)):
    f = img_u8.astype(np.float32) / 255
    L = f @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    mx, mn = f.max(2), f.min(2)
    sat = (mx - mn) / (mx + 1e-4)
    thr = np.percentile(L, 97)
    sel = (L >= thr) & (sat < 0.12)
    if sel.sum() < 500:
        sel = L >= thr
    mean = f[sel].mean(0)
    t = np.array(target, np.float32)
    g = t / mean
    g *= 0.94 / (t.max())        # bright neutral -> 0.94 cream
    return g.astype(np.float32)


_curve_x = np.array([0, 0.06, 0.18, 0.35, 0.5, 0.68, 0.84, 0.94, 1.0, 1.3])
_curve_y = np.array([0.028, 0.06, 0.155, 0.325, 0.49, 0.69, 0.855, 0.935, 0.962, 0.985])
CURVE = np.interp(np.linspace(0, 1.3, 2048), _curve_x, _curve_y).astype(np.float32)


def grade(img_u8, gains, clarity=0.3):
    f = img_u8.astype(np.float32) * (gains / 255.0)
    # local contrast / crema texture on luminance
    if clarity > 0:
        L = cv2.cvtColor(np.clip(f, 0, 1), cv2.COLOR_RGB2GRAY)
        Lb = cv2.GaussianBlur(L, (0, 0), 3.0)
        ratio = 1 + clarity * (L - Lb) / (L + 0.05)
        f *= ratio[..., None]
    idx = np.clip(f * (2047 / 1.3), 0, 2047).astype(np.int32)
    f = CURVE[idx]
    # split tone: espresso shadows, creamy highlights
    L = f @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    sh = ((1 - L) ** 2)[..., None]
    hi = (L ** 2)[..., None]
    f += sh * np.array([0.022, 0.006, -0.018], np.float32) + hi * np.array([0.004, 0.0, -0.008], np.float32)
    # selective saturation: richer caramel/espresso, calmer magenta/pink cast
    hsv = cv2.cvtColor(np.clip(f, 0, 1), cv2.COLOR_RGB2HSV)
    h = hsv[..., 0]
    boost = 1.04 + 0.16 * np.exp(-((h - 30) / 16) ** 2)
    pink = np.exp(-(np.minimum(np.abs(h - 345), np.abs(h + 15)) / 22) ** 2)
    boost *= 1 - 0.55 * pink
    green = np.exp(-((h - 105) / 45) ** 2)          # mute the green packaging -> soft sage
    boost *= 1 - 0.62 * green
    hsv[..., 2] *= 1 - 0.10 * green * hsv[..., 1]
    hsv[..., 1] = np.clip(hsv[..., 1] * boost, 0, 1)
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)


GAINS = {
    '9870': wb_gains(CLIPS['9870'][60]),
    '9871': wb_gains(CLIPS['9871'][120]),
    '9872': wb_gains(CLIPS['9872'][120]),
    'macro': wb_gains(MACRO),
}
GAINS['endcard'] = GAINS['9872']
print('wb gains', {k: v.round(3).tolist() for k, v in GAINS.items()}, flush=True)

# ------------------------------------------------------------------ global looks
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
rr = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H * 0.52) / (H * 0.62)) ** 2)
VIGNETTE = (1 - 0.26 * np.clip(rr, 0, 1.6) ** 2.3)[..., None].astype(np.float32)

_rng = np.random.default_rng(3)
GRAIN = []
for _ in range(10):
    g = _rng.standard_normal((H // 2, W // 2)).astype(np.float32)
    g = cv2.resize(g, (W, H), interpolation=cv2.INTER_LINEAR)
    GRAIN.append(g)


def light_leak(t, strength, phase=0.0):
    if strength <= 0.003:
        return None
    w, h = W // 4, H // 4
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    out = np.zeros((h, w, 3), np.float32)
    blobs = [
        ((0.95 - 0.5 * phase, 0.12 + 0.25 * phase), 0.42, (1.0, 0.62, 0.30)),
        ((1.10 - 0.35 * phase, 0.55 - 0.15 * phase), 0.35, (1.0, 0.80, 0.55)),
        ((-0.05 + 0.2 * phase, 0.92), 0.30, (0.95, 0.55, 0.30)),
    ]
    for (cx, cy), r, col in blobs:
        d2 = ((x / w - cx) / r) ** 2 + ((y / h - cy) / (r * 0.75)) ** 2
        out += np.exp(-d2 * 2.2)[..., None] * np.array(col, np.float32)
    out = cv2.resize(out, (W, H), interpolation=cv2.INTER_CUBIC)
    return np.clip(out * strength, 0, 1)


def screen(base, layer):
    return 1 - (1 - base) * (1 - layer)


# ------------------------------------------------------------------ typography
FONTDIR = os.path.join(ASSETS, 'fonts')
RUQAA = os.path.join(FONTDIR, 'aref-ruqaa-arabic-700-normal.woff')


class TextLayer:
    """Pre-rendered premultiplied RGBA crop placed at an output-space centre."""

    def __init__(self, rgba, center):
        self.rgba = rgba.astype(np.float32)
        self.cx, self.cy = center

    def composite(self, frame, alpha=1.0, scale=1.0, dy=0.0, blur=0.0, wipe=1.0, feather=180, wipe_mode='rtl'):
        if alpha <= 0.002 or wipe <= 0.0:
            return frame
        h, w = self.rgba.shape[:2]
        layer = self.rgba.copy()
        if wipe < 1.0:
            xs = np.arange(w, dtype=np.float32)
            if wipe_mode == 'rtl':
                b = w - wipe * (w + feather)
                mask = np.clip((xs - b) / feather, 0, 1)
            else:  # centre-out
                half = wipe * (w / 2 + feather)
                mask = np.clip((half - np.abs(xs - w / 2)) / feather, 0, 1)
            layer *= mask[None, :, None]
        if blur > 0.3:
            layer = cv2.GaussianBlur(layer, (0, 0), blur)
        M = np.array([[scale, 0, self.cx - scale * w / 2], [0, scale, self.cy + dy - scale * h / 2]], np.float32)
        full = cv2.warpAffine(layer, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        a = full[..., 3:4] * alpha
        return frame * (1 - a) + full[..., :3] * alpha


def render_arabic(text, size, color, glow=0.0, pad=90):
    font = ImageFont.truetype(RUQAA, size, layout_engine=ImageFont.Layout.RAQM)
    tmp = ImageDraw.Draw(Image.new('L', (10, 10)))
    bb = tmp.textbbox((0, 0), text, font=font, direction='rtl', language='ar')
    w, h = bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).text((pad - bb[0], pad - bb[1]), text, font=font, fill=255, direction='rtl', language='ar')
    a = np.asarray(mask, np.float32) / 255
    rgb = np.ones((h, w, 3), np.float32) * color
    out_a = a.copy()
    out_rgb = rgb * a[..., None]
    if glow > 0:
        g = np.asarray(mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(26)), np.float32) / 255
        g = np.clip(g * 1.6, 0, 1) * glow
        # glow below text (premultiplied 'over')
        out_rgb = out_rgb + CREAM * g[..., None] * (1 - a[..., None])
        out_a = a + g * (1 - a)
    return np.dstack([out_rgb, out_a])


def dot_layer(r=9):
    s = 4 * r
    y, x = np.mgrid[0:s, 0:s].astype(np.float32)
    d = np.sqrt((x - s / 2 + 0.5) ** 2 + (y - s / 2 + 0.5) ** 2)
    a = np.clip(r - d + 0.5, 0, 1)
    return np.dstack([GOLD * a[..., None], a])


def line_layer(length=240, thick=4, col=np.array([176, 140, 88], np.float32) / 255):
    pad = 8
    a = np.zeros((thick + 2 * pad, length + 2 * pad), np.float32)
    a[pad:pad + thick, pad:pad + length] = 1
    a = cv2.GaussianBlur(a, (0, 0), 0.7)
    return np.dstack([col * a[..., None], a])


# Text A: "اهدأ قليلاً" + three gold dots (the ellipsis, drawn as design elements)
TA_Y = 600
TXT_A = TextLayer(render_arabic('اهدأ قليلاً', 132, ESPRESSO, glow=0.55), (W / 2 + 28, TA_Y))
_ta_w = TXT_A.rgba.shape[1] - 180
DOTS = [TextLayer(dot_layer(), (W / 2 + 28 - _ta_w / 2 - 24 - 30 * k, TA_Y + 34)) for k in range(3)]

# Text B: "ثم عُد أقوى" + growing gold rule
TB_Y = 415
TXT_B = TextLayer(render_arabic('ثم عُد أقوى', 156, ESPRESSO, glow=0.6), (W / 2, TB_Y))
RULE_B = TextLayer(line_layer(230, 5), (W / 2, TB_Y + 118))


# End card: extract the poster's own typography (title / gold rule / subtitle) as RGBA layers
def extract_poster_text():
    P = POSTER.astype(np.float32) / 255
    B = POSTER_CLEAN.astype(np.float32) / 255
    bands = {'title': (430, 745), 'rule': (745, 795), 'sub': (800, 905)}
    S = max(W / P.shape[1], H / P.shape[0])
    ox = (W - S * P.shape[1]) / 2
    oy = (H - S * P.shape[0]) / 2
    layers = {}
    for k, (y0, y1) in bands.items():
        p, b = P[y0:y1, 200:1150], B[y0:y1, 200:1150]
        d = b - p
        mag = np.linalg.norm(d, axis=2)
        sel = mag > np.percentile(mag, 99.3)
        T = p[sel].mean(0) if k != 'rule' else p[mag > np.percentile(mag, 97)].mean(0)
        bt = b - T
        a = np.clip((d * bt).sum(2) / ((bt * bt).sum(2) + 1e-4), 0, 1)
        a[a < 0.06] = 0
        rgba = np.dstack([T * a[..., None], a])
        # into output scale
        rgba = cv2.resize(rgba, None, fx=S, fy=S, interpolation=cv2.INTER_AREA)
        cx = ox + S * (200 + 1150) / 2
        cy = oy + S * (y0 + y1) / 2
        layers[k] = TextLayer(rgba, (cx, cy))
    return layers, (S, ox, oy)


PT, PSCALE = extract_poster_text()


# ------------------------------------------------------------------ speed ramps
def make_ramp(t0, t1, src0, keys):
    """keys: list of (t, speed); returns function t->src_t by integrating speed."""
    ts = np.linspace(t0, t1, 2000)
    kt, ks = zip(*keys)
    sp = np.interp(ts, kt, ks)
    src = src0 + np.concatenate([[0], np.cumsum((sp[1:] + sp[:-1]) / 2 * np.diff(ts))])
    return lambda t: float(np.interp(t, ts, src))


RAMP_9871 = make_ramp(14.4, 21.0, 1.55, [(14.4, 1.0), (15.0, 0.6), (16.8, 0.6), (17.6, 2.0), (18.6, 2.0),
                                          (19.4, 0.7), (21.0, 0.7)])


# ------------------------------------------------------------------ shots (return graded float RGB)
def shot_macro(t, z, cx, cy, dx=0, dy=0):
    M = cover_matrix(MACRO.shape[1], MACRO.shape[0], z, cx, cy, dx, dy)
    return grade(warp(MACRO, M), GAINS['macro'], clarity=0.22)


def shot_clip(name, src_t, z, cx=0.5, cy=0.5, dx=0, dy=0, clarity=0.3):
    f = clip_frame(name, src_t)
    M = cover_matrix(f.shape[1], f.shape[0], z, cx, cy, dx, dy)
    return grade(warp(f, M), GAINS[name], clarity)


def endcard_zoom(t):
    return lerp(1.015, 1.055, smooth(seg(t, 20.1, 27.0)))


def endcard_matrix(t):
    S, ox, oy = PSCALE
    A = np.vstack([ALIGN, [0, 0, 1]])
    P2O = np.array([[S, 0, ox], [0, S, oy], [0, 0, 1]])
    z = endcard_zoom(t)
    Z = np.array([[z, 0, W / 2 * (1 - z)], [0, z, H * 0.45 * (1 - z)], [0, 0, 1]])
    return (Z @ P2O @ A)[:2], Z


def shot_endcard(t):
    src = 4.05 + (t - 20.1) * 0.58
    f = clip_frame('9872', src)
    M, _ = endcard_matrix(t)
    return grade(warp(f, M), GAINS['endcard'], 0.3)


def motion_blurred(fn, t, n=7, shutter=0.5):
    acc = None
    for k in range(n):
        tt = t + (k / (n - 1) - 0.5) * shutter / FPS
        f = fn(tt)
        acc = f if acc is None else acc + f
    return acc / n


def punch(t, t0, amt=0.045):
    return 1 + amt * np.exp(-max(0.0, t - t0) / 0.12)


# Shot timeline ------------------------------------------------------------
def s1(t):  # Hook: macro crema still – rack focus + pull-out reveal, then zoom-through
    if t < 3.35:
        x = smooth(seg(t, 0.0, 3.35))
        z = lerp(2.9, 1.1, x ** 0.85)
        cx, cy = lerp(0.56, 0.5, x), lerp(0.29, 0.42, x)
    else:
        x = ease_in(seg(t, 3.35, 3.72))
        z = 1.1 * (1 + 0.65 * x)
        cx, cy = 0.5, lerp(0.42, 0.33, x)
    img = shot_macro(t, z, cx, cy)
    sig = 16 * (1 - ease_out(seg(t, 0.15, 1.5)))
    if sig > 0.4:
        img = cv2.GaussianBlur(img, (0, 0), sig)
    return img


def s2(t):  # 9870 low macro, slow motion push-in
    src = 0.1 + (t - 3.5) * 0.78
    zin = 1 + 0.38 * (1 - ease_out(seg(t, 3.5, 4.05)))
    z = zin * lerp(1.1, 1.2, smooth(seg(t, 3.5, 8.7)))
    img = shot_clip('9870', src, z, 0.5, 0.5)
    sig = 10 * smooth(seg(t, 8.1, 8.7))
    if sig > 0.4:
        img = cv2.GaussianBlur(img, (0, 0), sig)
    return img


def s3(t):  # 9872 hero establishing + Text A
    src = 0.2 + (t - 8.1) * 0.9
    z = lerp(1.04, 1.13, smooth(seg(t, 8.1, 12.0)))
    img = shot_clip('9872', src, z, 0.5, 0.55)
    sig = 10 * (1 - smooth(seg(t, 8.1, 8.7)))
    if sig > 0.4:
        img = cv2.GaussianBlur(img, (0, 0), sig)
    return img


def montage(t):
    if t < 12.6:
        return shot_macro(t, lerp(2.0, 2.18, seg(t, 12.0, 12.6)) * punch(t, 12.0), 0.62, 0.3,
                          dx=lerp(30, -30, seg(t, 12.0, 12.6)))
    if t < 13.2:
        return shot_clip('9870', 2.6 + (t - 12.6), lerp(1.7, 1.82, seg(t, 12.6, 13.2)) * punch(t, 12.6), 0.5, 0.36)
    if t < 13.8:
        return shot_clip('9871', 0.6 + (t - 13.2), lerp(1.6, 1.72, seg(t, 13.2, 13.8)) * punch(t, 13.2), 0.45, 0.45)
    x = ease_in(seg(t, 13.8, 14.4))
    return shot_clip('9872', 1.0 + (t - 13.8), lerp(1.3, 2.7, x) * punch(t, 13.8, 0.03), 0.5, 0.5)


def s5(t):  # 9871 peak with speed ramp + impact
    src = RAMP_9871(t)
    zi = lerp(1.24, 1.0, ease_out(seg(t, 14.4, 15.1)))
    z = zi * lerp(1.07, 1.03, smooth(seg(t, 15.1, 21.0)))
    k = np.exp(-max(0.0, t - 14.4) / 0.18)
    dx = 7 * k * np.sin(t * 95)
    dy = 5 * k * np.cos(t * 81)
    img = shot_clip('9871', src, z, 0.5, 0.5, dx, dy)
    sig = 7 * smooth(seg(t, 20.1, 20.9))
    if sig > 0.4:
        img = cv2.GaussianBlur(img, (0, 0), sig)
    return img


def base_frame(t):
    if t < 3.5:
        fn = s1
        mb = 3.3 < t
        img = motion_blurred(fn, t) if mb else fn(t)
        if t > 3.35:
            pass
        return img
    if t < 3.72:  # zoom-through crossfade
        a = smooth(seg(t, 3.5, 3.72))
        return motion_blurred(s1, t) * (1 - a) + motion_blurred(s2, t) * a
    if t < 8.1:
        return motion_blurred(s2, t) if t < 4.05 else s2(t)
    if t < 8.7:
        a = smooth(seg(t, 8.1, 8.7))
        return s2(t) * (1 - a) + s3(t) * a
    if t < 12.0:
        return s3(t)
    if t < 14.4:
        return motion_blurred(montage, t) if t >= 13.8 else montage(t)
    if t < 20.1:
        return motion_blurred(s5, t, n=5) if (t < 14.75 or 17.2 < t < 19.0) else s5(t)
    if t < 20.9:
        a = smooth(seg(t, 20.1, 20.9))
        return s5(t) * (1 - a) + shot_endcard(t) * a
    return shot_endcard(t)


def leak_strength(t):
    s = 0.0
    s += 0.16 * np.exp(-t / 0.9)
    s += 0.22 * np.exp(-((t - 3.6) / 0.16) ** 2)
    s += 0.20 * np.exp(-max(0.0, t - 14.4) / 0.35) * (t >= 14.4)
    s += 0.42 * np.exp(-((t - 20.5) / 0.35) ** 2)
    s += 0.07 * smooth(seg(t, 22.0, 24.0)) * (1 - smooth(seg(t, 25.5, 26.6)))
    return s


def compose(t):
    f = base_frame(t)
    f = np.clip(f, 0, 1)

    # light leaks
    ls = leak_strength(t)
    phase = seg(t, 19.8, 21.2) if t > 15 else seg(t, 0, 4)
    leak = light_leak(t, ls, phase)
    if leak is not None:
        f = screen(f, leak)

    f = f * VIGNETTE

    # ---- typography
    # Text A over hero (9.0 -> 11.85)
    if 8.9 < t < 11.95:
        inn = ease_out(seg(t, 9.0, 10.0))
        out = smooth(seg(t, 11.3, 11.85))
        f = TXT_A.composite(f, alpha=1 - out, dy=lerp(22, 0, inn) - 26 * out,
                            blur=5 * (1 - ease_out(seg(t, 9.0, 9.7))) + 6 * out, wipe=smooth(seg(t, 9.0, 10.05)))
        for k, d in enumerate(DOTS):
            t0 = 10.05 + 0.3 * k
            a = ease_out(seg(t, t0, t0 + 0.22))
            f = d.composite(f, alpha=a * (1 - out), scale=lerp(1.8, 1.0, a), dy=-26 * out)
    # Text B at the impact (14.4 -> 20.0)
    if 14.38 < t < 20.1:
        a = ease_out(seg(t, 14.4, 14.72))
        sc = lerp(1.16, 1.0, ease_out(seg(t, 14.4, 15.0)))
        out = smooth(seg(t, 19.45, 20.05))
        f = TXT_B.composite(f, alpha=a * (1 - out), scale=sc, blur=8 * (1 - ease_out(seg(t, 14.4, 14.8))) + 6 * out,
                            dy=-24 * out)
        f = RULE_B.composite(f, alpha=1 - out, wipe=ease_out(seg(t, 14.85, 15.6)), feather=40, wipe_mode='center',
                             dy=-24 * out)
    # End card typography (from the supplied design), moves with the end-card push-in
    if t > 20.9:
        _, Z = endcard_matrix(t)
        z = Z[0, 0]

        def place(layer):
            return (Z @ np.array([layer.cx, layer.cy, 1.0]))[:2]

        for key, t0, t1, mode in (('title', 21.0, 22.35, 'rtl'), ('rule', 22.2, 22.9, 'center'),
                                  ('sub', 22.75, 23.7, 'fade')):
            L = PT[key]
            cx, cy = place(L)
            ox, oy = L.cx, L.cy
            L.cx, L.cy = cx, cy
            if mode == 'rtl':
                p = smooth(seg(t, t0, t1))
                f = L.composite(f, scale=z, wipe=p, blur=4 * (1 - ease_out(seg(t, t0, t1))), feather=220,
                                dy=lerp(16, 0, ease_out(seg(t, t0, t1))))
            elif mode == 'center':
                f = L.composite(f, scale=z, wipe=ease_out(seg(t, t0, t1)), feather=40, wipe_mode='center')
            else:
                a = ease_out(seg(t, t0, t1))
                f = L.composite(f, alpha=a, scale=z, dy=lerp(18, 0, a), blur=3 * (1 - a))
            L.cx, L.cy = ox, oy

    # fade in from black / out to black
    fade = ease_out(seg(t, 0.0, 0.3)) * (1 - smooth(seg(t, 26.1, 27.0)))
    f = f * fade

    # film grain (luma), stronger in mids
    L = f.mean(2, keepdims=True)
    g = GRAIN[int(t * FPS) % len(GRAIN)][..., None]
    f = f + g * 0.011 * (0.5 + 2.0 * L * (1 - L))
    return (np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)


def worker(i):
    return compose(i / FPS).tobytes()


if __name__ == '__main__':
    if FRAMES_ONLY:
        os.makedirs(OUT, exist_ok=True)
        for t in FRAMES_ONLY:
            img = compose(t)
            Image.fromarray(img).save(os.path.join(OUT, f'f_{t:05.2f}.jpg'), quality=92)
        print('frames written')
        sys.exit(0)

    audio = os.path.join(WORK, 'soundtrack.wav')
    cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
           '-i', '-', '-i', audio,
           '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p',
           '-c:v', 'libx264', '-preset', 'veryfast' if PREVIEW else 'slow', '-crf', '22' if PREVIEW else '15',
           '-profile:v', 'high', '-level', '4.1', '-tune', 'film',
           '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
           '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', str(DUR), '-movflags', '+faststart', OUT]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    ctx = mp.get_context('fork')
    with ctx.Pool(int(os.environ.get('JOBS', '4'))) as pool:
        for k, buf in enumerate(pool.imap(worker, range(NF), chunksize=4)):
            p.stdin.write(buf)
            if k % 60 == 0:
                print(f'frame {k}/{NF}', flush=True)
    p.stdin.close()
    p.wait()
    print('done', OUT)
