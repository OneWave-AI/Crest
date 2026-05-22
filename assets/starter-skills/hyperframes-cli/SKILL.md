---
name: hyperframes-cli
description: HyperFrames CLI dev loop — use `npx hyperframes` for scaffolding (init), validation (lint, inspect), preview, render, and environment troubleshooting (doctor, browser, info, upgrade). Use when working in or alongside a HyperFrames project and the user asks to scaffold, preview, render, lint, install a registry block, or diagnose a broken environment.
---

# HyperFrames CLI

Everything in a HyperFrames project routes through `npx hyperframes`. This
skill is the operator's manual — when the user asks to "preview", "render",
"add a transition", or when something breaks, run the right command.

## Command map

| Command | When to use |
| --- | --- |
| `npx hyperframes init` | Start a new composition. Prompts for template (Tailwind, blank, etc.) |
| `npx hyperframes init --tailwind` | Skip the prompt and scaffold with Tailwind (recommended default) |
| `npx hyperframes preview` | Live preview in the browser with hot reload |
| `npx hyperframes lint` | Validate timing, schema, missing assets |
| `npx hyperframes inspect` | Print the parsed scene graph — use when timing looks off |
| `npx hyperframes render` | Render the composition. Defaults: 1920x1080, 30fps, MP4 |
| `npx hyperframes render --format gif` | GIF output (smaller, lower quality) |
| `npx hyperframes render --format webm` | WebM output (transparent backgrounds supported) |
| `npx hyperframes render --width 1080 --height 1920` | Vertical for Reels / TikTok / Shorts |
| `npx hyperframes add <block>` | Install a registry block (e.g., `lower-third`, `glitch-transition`) |
| `npx hyperframes doctor` | Check the environment (browser, ffmpeg, node) |
| `npx hyperframes browser` | Reinstall the Playwright browser used for rendering |
| `npx hyperframes info` | Print version + environment summary |
| `npx hyperframes upgrade` | Update to the latest version |

If a flag is uncertain, run `npx hyperframes <command> --help` first.

## Standard workflow

1. **Scaffold** — `npx hyperframes init` (or `--tailwind`)
2. **Compose** — edit the HTML in `src/`
3. **Preview** — `npx hyperframes preview` in one terminal; edit + save in
   another. Hot reload is fast.
4. **Lint** — `npx hyperframes lint` before every render. Catches the 90%
   of bugs preview misses (timing overlaps, missing assets, schema drift).
5. **Render** — `npx hyperframes render`

## When things break

- **Render fails / blank output** → `npx hyperframes doctor`. Usually a
  missing browser binary or ffmpeg.
- **Stale preview / changes not appearing** → restart `preview`, clear
  browser cache.
- **Schema errors** → `npx hyperframes inspect` shows what the parser is
  actually seeing. Compare against the source.
- **"Browser not found"** → `npx hyperframes browser` reinstalls it.
- **Version mismatch with a tutorial** → `npx hyperframes info` then
  `npx hyperframes upgrade` if you're behind.

## Registry blocks

`npx hyperframes add` pulls pre-built blocks (captions, lower thirds,
transitions, VFX, text effects) into the project. Browse what's available
with `npx hyperframes add --list`. After adding a block, the project
imports it automatically — no manual wiring.

Good defaults to suggest:
- `lower-third-clean` — overlay names/titles
- `caption-bouncy` — subtitle/caption styling
- `transition-fade` — smooth scene-to-scene fade
- `transition-glitch` — kinetic, modern cut
- `text-effect-typewriter` — character-by-character reveal

## Notes

- Don't edit the rendered output directly — always edit the source HTML
  and re-render.
- Commit the source, not the MP4. Rendering is deterministic; the artifact
  rebuilds.
- If the user is using Tailwind, the project already includes the CDN
  build — no separate Tailwind config needed for most cases.
