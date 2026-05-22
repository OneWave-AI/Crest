---
name: hyperframes
description: Create video compositions, animations, title cards, overlays, captions, voiceovers, audio-reactive visuals, and scene transitions. Use whenever the user asks to build a video, motion graphic, animated explainer, intro, outro, title card, or convert a website / podcast / talk into a video. HyperFrames is HTML-based — fast iteration, real rendering.
---

# HyperFrames

HyperFrames is a video-composition framework that lets you build cinematic
compositions in plain HTML/CSS/JS, preview them live, and render them to MP4
or GIF. It's like Remotion, but lighter and browser-native.

## When to use this skill

Activate whenever the user wants to:

- Create a video, animation, or motion graphic
- Build a title card, lower third, intro, outro, or scene transition
- Generate an animated explainer, demo reel, or product walkthrough
- Add captions, subtitles, or voiceover to a composition
- Convert a website, blog post, podcast, or talk into a video
- Make an audio-reactive visual
- Render an animated logo or social-media short

If the user says "video," "animation," "motion," "render," "MP4," or describes
something time-based — this skill is the right call.

## The CLI

Everything routes through `npx hyperframes`:

| Command | Purpose |
| --- | --- |
| `npx hyperframes init` | Scaffold a new composition (Tailwind, blank, or template) |
| `npx hyperframes preview` | Live preview in the browser with hot reload |
| `npx hyperframes lint` | Validate the composition against the schema |
| `npx hyperframes inspect` | Dump the parsed scene graph for debugging |
| `npx hyperframes render` | Produce MP4 / WebM / GIF |
| `npx hyperframes doctor` | Diagnose environment issues (browser, ffmpeg) |
| `npx hyperframes add <block>` | Install a registry block (caption, transition, etc.) |

Start every new project with `npx hyperframes init` from the user's chosen
working directory. Confirm with the user where to scaffold before running.

## Core mental model

A HyperFrames composition is a single HTML file (or small project) that
declares:

1. **Duration** — how long the composition runs (`data-duration` or config)
2. **Layers** — stacked elements that appear/disappear over time
3. **Timing** — `data-start`, `data-end`, easings, and keyframes per layer
4. **Adapters** — bring your own animation library: GSAP, Anime.js, Web
   Animations API, CSS animations, Lottie, Three.js. HyperFrames stays out
   of the way and just orchestrates time.

The renderer plays the composition deterministically — same input, same
output every time. That's what makes it diff-friendly and AI-friendly.

## Workflow

1. **Scaffold** — `npx hyperframes init` and pick a template
2. **Compose** — edit the HTML; add layers, set timing, choose an animation
   library. Keep the composition tightly scoped: one scene per file is fine.
3. **Preview** — `npx hyperframes preview` for hot-reload
4. **Lint + inspect** — catch timing overlaps and missing assets early
5. **Render** — `npx hyperframes render --format mp4` (or `gif`, `webm`)

## Companion skills

When the user's request fits a more specific workflow, lean on the matching
skill — Claude Code will auto-load them when relevant:

- **website-to-hyperframes** — turn a URL into a video (screenshots → scenes)
- **remotion-to-hyperframes** — port an existing Remotion project
- **hyperframes-media** — TTS narration (Kokoro), Whisper transcription,
  transparent overlays via background removal
- **hyperframes-registry** — install community blocks (lower thirds, VFX,
  transitions, text effects) via `npx hyperframes add`
- Adapter skills: `gsap`, `animejs`, `waapi`, `css-animations`, `lottie`,
  `three`, `tailwind` — patterns for each animation library inside
  HyperFrames

## Defaults that make life easier

- Prefer the Tailwind template (`npx hyperframes init --tailwind`) — most
  users want styled compositions and Tailwind makes it fast.
- Default to GSAP for timeline-based animation; WAAPI for simple element
  motion; Lottie for designer-provided JSON animations.
- Render at 1920x1080 @ 30fps unless the user asks otherwise. Vertical
  (1080x1920) for TikTok / Reels / Shorts.
- Always run `npx hyperframes lint` before `render` — catches the 90% of
  bugs that aren't visible in preview.

## A minimal example

```html
<!doctype html>
<html data-duration="6000">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="https://cdn.tailwindcss.com" />
  </head>
  <body class="bg-black text-white font-sans">
    <div class="absolute inset-0 grid place-items-center"
         data-start="0" data-end="3000">
      <h1 class="text-7xl font-bold tracking-tight">Crest</h1>
    </div>
    <div class="absolute inset-0 grid place-items-center"
         data-start="3000" data-end="6000">
      <p class="text-3xl text-emerald-400">Built for Claude Code</p>
    </div>
  </body>
</html>
```

That's a six-second, two-scene title sequence. `npx hyperframes preview` to
see it, `npx hyperframes render` to ship the MP4.

## What to ask the user up front

Before scaffolding, get answers to:

1. **What's the video for?** (title card, demo, explainer, social short)
2. **How long?** (under 15s for social, 30-60s for product, 1-3 min for
   explainers)
3. **Aspect ratio?** (16:9 desktop, 9:16 social, 1:1 feed)
4. **Voiceover or silent?** (if voiceover, use `hyperframes-media` to
   generate TTS)
5. **Brand assets?** (logo, colors, fonts — pull from a brand kit if one
   exists)

Once you have those, scaffold and start composing.
