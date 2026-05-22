---
name: hyperframes-media
description: Asset preprocessing for HyperFrames compositions — text-to-speech narration (Kokoro), audio/video transcription (Whisper), and background removal for transparent overlays. Use when a HyperFrames project needs a voiceover, captions/subtitles from existing audio, or a clean cutout from a photo/video for use as an overlay.
---

# HyperFrames Media

Three preprocessing pipelines that turn raw inputs into HyperFrames-ready
assets:

1. **Narration** — text to spoken audio (Kokoro TTS, runs locally)
2. **Transcription** — audio/video to timestamped captions (Whisper)
3. **Cutouts** — remove backgrounds from images for transparent overlays

Use this skill when the user wants any of those, *as input to a
HyperFrames composition*. For standalone TTS or transcription that won't
end up in a video, suggest a simpler approach.

## When to use

- "Add a voiceover that says ..."
- "Generate narration for this script"
- "Caption this audio / video"
- "Turn this podcast into a captioned video"
- "Remove the background from this photo so I can overlay it"
- "Make this product shot transparent"

## Narration (Kokoro TTS)

Local, fast, no API key needed. Good defaults:

- **Voice**: Kokoro ships several. Default to a neutral American voice
  for product/marketing; pick a warmer voice for storytelling.
- **Speed**: 1.0x for most cases. Slow to 0.9x if pronunciation matters
  (technical demos); speed to 1.1x for energetic shorts.
- **Output**: WAV at 24kHz, then convert to MP3 if size matters.

Drop the audio file into the HyperFrames project's `assets/audio/` and
reference it from a layer with `data-audio="./assets/audio/voiceover.mp3"`.
The composition's `data-duration` should match (or exceed) the audio length.

## Transcription (Whisper)

For captions/subtitles, use Whisper to produce a timestamped transcript.

- **Model size**: `base` is fast and good enough for most accents. Use
  `small` or `medium` only if `base` produces errors.
- **Output**: Ask for SRT or JSON with per-word timestamps. Word-level
  timestamps unlock animated/karaoke-style captions.
- **Format for HyperFrames**: convert the timestamps to milliseconds and
  emit caption layers with `data-start` / `data-end` per line (or per
  word for kinetic captions).

If the user has source audio + a script, prefer **alignment** (Whisper
with `--initial_prompt` to bias toward the known script) over raw
transcription. Result is cleaner.

## Background removal (cutouts)

For transparent overlays — speaker headshots floating over a colored
background, product cutouts, mascot characters, etc.

- **Library**: `rembg` (uses U2-Net or similar) is the standard. Output a
  PNG with alpha.
- **For video**: process every nth frame, then chain with `ffmpeg` to
  reassemble. Slower but works.
- **Quality check**: zoom in on hair edges and semi-transparent areas
  (glass, hair) — those are where rembg struggles. Suggest the user
  re-shoot against a green screen if quality matters more than speed.

Drop the alpha PNG into `assets/images/` and place it as a layer:

```html
<img src="./assets/images/host.png"
     class="absolute right-12 bottom-12 w-64"
     data-start="0" data-end="6000" />
```

## Tying it together

A common flow for a 30-second product demo:

1. User writes a 30s script
2. `hyperframes-media` → Kokoro generates the voiceover (~28s of audio)
3. Whisper transcribes the voiceover with word-level timestamps
4. `website-to-hyperframes` captures the product page at the right moments
5. HyperFrames composition layers: site capture (background), captions
   (timed to voiceover), cutout of the founder in the corner (start →
   3s and end - 3s → end)
6. `npx hyperframes render` produces a captioned, narrated demo

## Notes

- All three pipelines run locally. No API keys, no data leaving the
  machine — useful for client work under NDA.
- Keep raw inputs in `assets/raw/` and processed outputs in `assets/`.
  Makes the project regeneratable.
- If a tool isn't installed yet, run the install command and proceed —
  don't ask the user to leave the conversation to set things up.
