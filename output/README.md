# وقت القهوة — Coffee Time · Cinematic Reel

**Deliverables (this folder)**

| File | What it is |
|---|---|
| `Final_Video_1080x1920.mp4` | Final reel: 1080×1920 (9:16), 30 fps, 27.0 s, H.264 High@4.1 ~12 Mb/s (≈42 MB), AAC-LC 256 kb/s 48 kHz, BT.709, fast-start · −14.1 LUFS / −1.8 dBTP |
| `Thumbnail_1080x1920.jpg` | Cover / thumbnail, taken from the end-card frame |
| `project/` | Everything needed to regenerate the video (scripts, fonts, still assets) |

## Creative structure (100 BPM: beat = 0.6 s, bar = 2.4 s)

| Time | Scene | Source | Technique | Sound |
|---|---|---|---|---|
| 0.0–3.6 | **Hook**: abstract golden crema, rack-focus from soft to sharp, then a pull-out that reveals the cup | crema still (IMG_9869) | 2.9× → 1.1× push-out, focus pull, warm light bloom | room tone, ceramic *tink*, sparse piano |
| 3.6 | Zoom-through transition | — | accelerating zoom + motion blur + crossfade | whoosh |
| 3.6–8.4 | Low macro of the cup rim | IMG_9870 | 0.78× slow motion, slow push-in | warm pad, piano arpeggios |
| 8.4 | Focus-pull dissolve | — | defocus out / defocus in | soft swell |
| 8.4–12.0 | Hero shot. Text: **«اهدأ قليلاً…»** (wipes in right-to-left; the three dots land one at a time on the beat) | IMG_9872 | slow push-in | bass enters |
| 12.0–14.4 | Beat montage (4 cuts, one per beat) | still + 9870 + 9871 + 9872 | punch-in on every cut, accelerating zoom with motion blur | kick, hats, snare roll, riser |
| 14.4 | **Impact / emotional peak**. Text: **«ثم عُد أقوى»** + gold rule | IMG_9871 | impact cut, zoom settle and micro-shake, then a speed ramp (1.0× → 0.6× → 2.0× → 0.7×) through the handle reveal | impact, full groove, string ostinato, melody |
| 20.1–20.9 | Match dissolve into the end card | — | light-leak sweep plus defocus dissolve | swell, whoosh |
| 20.9–27.0 | **Signature end card**: the supplied **«وقت القهوة / لحظة هدوء في منتصف اليوم»** design, brought to life | IMG_9872 (live) + the poster's typography | title wipes in right-to-left, gold rule grows from the centre, subtitle rises in, slow push-in, fade to black | groove carries the title reveal, drops at 22.8 (G → Asus4 → A), resolves to D(add9) at 24.0 with reverb tail |

**About the end card.** The supplied poster (IMG_9873) is a frame of the IMG_9872 shot. I matched the two with feature matching (≈1,900 matched points, 1.22× scale). I then lifted the poster's own typography off the image as transparent layers by cleaning the text out of the background and separating the lettering by colour. The result is that the end card plays the **live** hero shot with the **original** Arabic lettering animated over it. The visual identity is unchanged, and the end card moves instead of sitting still.

## Technical pipeline

1. **Source inspection.** The `.mov` clips are **native 1080×1920 HEVC 10-bit HDR** (Dolby Vision 8.4 / HLG, BT.2020) at 29.97 fps, rotated −90° in their metadata. They are not 512×910, so no AI upscaling was needed. The two stills are 1320×2262 and 1450×2576.
2. **HDR → SDR tone-mapping** (zscale + Hable) to BT.709. Otherwise the HLG footage looks washed out or blown out on social platforms. All clips were conformed to 30 fps.
3. **Grade** (`render.py → grade()`):
   - per-clip white balance that pulls bright neutrals to a clean cream
   - a filmic S-curve with soft, slightly lifted blacks
   - espresso shadows and creamy highlights (split toning)
   - more saturation in the caramel and coffee hues
   - the pink cast and the green packaging toned down
   - gentle local contrast to bring out crema texture
   - a soft vignette and fine film grain
4. **Motion.** All moves are sub-pixel affine camera moves with eased curves. Real multi-sample motion blur is used on zoom transitions and the speed ramp. Slow motion uses frame blending.
5. **Arabic typography.** Text is rendered with HarfBuzz/RAQM, so letters join and shape correctly right to left. The typeface is **Aref Ruqaa Bold** (SIL OFL), chosen to match the poster's headline. It is set in espresso `#3A261B` with a soft cream glow so it reads on light backgrounds on a phone. Accents are gold.
6. **Soundtrack** (`soundtrack.py`). The score is fully original and synthesised, so there are no licensing issues:
   - piano, pads, string ostinato, bass, drums
   - riser, impact, whooshes, a ceramic *tink*
   - the clips' own room tone as an ambient bed
   - mixed to about **−14 LUFS** integrated with a true peak of about −2 dBFS, which suits Instagram, TikTok and Snapchat
7. **Encode.** Master render x264 `-preset slow -crf 15 -tune film` (≈100 MB). The delivery file is a re-encode at CRF 19 capped at 12 Mb/s (SSIM 0.98 against the master). This keeps it inside upload and WhatsApp limits and avoids a second heavy compression by the platforms.

## Regenerate

Requirements: ffmpeg (with zscale/libx264), Python 3.10+, `numpy scipy opencv-python-headless pillow` (Pillow needs RAQM support for Arabic).

```bash
cd output/project
# folder must contain IMG_9870.mov IMG_9871.mov IMG_9872.mov
./build.sh /path/to/source_clips            # final render  -> ../Final_Video_1080x1920.mp4
./build.sh /path/to/source_clips preview    # fast preview  -> work/preview.mp4
# single frames for review:
python3 render.py work assets frames_out --frames 1.0,9.6,14.5,24
```

All timings, text, easing and grade values are plain constants in `render.py` (search for `Text A`, `Text B`, `s1`…`s5`, `grade`). Music structure and mix levels are in `soundtrack.py`.

## Honest notes

- The footage is real 1080p, but it comes from a phone with a very shallow depth of field. Some of the tighter montage crops (up to about 2×) are soft by nature. No artificial sharpening was added beyond mild local contrast.
- The music is synthesised. It is clean and built for this edit, but it is not a live orchestral recording. If you have a licensed track you prefer, replace `work/soundtrack.wav` and re-run `render.py`. The cut points sit on a 100 BPM grid.
