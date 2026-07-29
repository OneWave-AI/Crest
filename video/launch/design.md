# Crest Launch — Design

## Brand

Crest is a premium native desktop app for Claude Code and OpenAI Codex.
Tagline: **Code with Superpowers**.
Audience: developers + non-technical builders. Premium feel, dark canvas, warm
accent. Cinematic launch energy — not a corporate explainer.

## Palette

- `--bg`: `#030303` (near-black canvas)
- `--surface`: `#0a0a0a` (panels, code blocks)
- `--surface-2`: `#141414` (cards, raised UI)
- `--fg`: `#f5efe8` (warm off-white, NOT pure white)
- `--fg-dim`: `#9a8f84` (warm gray for labels/captions)
- `--primary`: `#FF4F18` (Crest orange — focal accent)
- `--primary-soft`: `#FF6A3D` (hover/glow)
- `--accent`: `#10B981` (status green, sparingly — only for "active" cues)
- `--rule`: `rgba(245,239,232,0.08)` (hairline dividers)

Background is solid `#030303` with a slow-breathing radial glow tinted toward
`--primary` at 12–20% opacity. Never pure `#000` or `#fff`.

## Typography

- **Display / headline**: `"Space Grotesk", system-ui, sans-serif`
  weight 700 for hero, weight 500 for subhead.
- **Mono / labels / metadata**: `"JetBrains Mono", ui-monospace, monospace`
  weight 400, uppercase, tracked-out `0.18em` for section tags.
- Headline sizes 96–160px. Subhead 42–56px. Body 32–38px. Mono labels 22–26px.
- Tracking on display: `-0.025em`. Line-height: `1.05`.

Pairing rationale: clean modern grotesk + technical monospace. Sans + mono =
"product is a tool for engineers, but the brand is human."

## Motion

- Easings: vary across `power3.out`, `expo.out`, `power2.inOut`, `sine.inOut`.
  No more than 2 tweens share an ease in a single scene.
- Entrance speeds: 0.4–0.8s. Hero slams: 0.25–0.35s. Holds: 1.5–2.5s.
- Every scene has ONE shared ambient motion (breathing glow, slow pan, drift).
- Image treatment: every screenshot wrapped in a device-frame div with
  `border-radius: 14px`, `border: 1px solid rgba(255,255,255,0.08)`,
  layered box-shadow incl. an orange-tinted outer glow at 8% opacity.

## Decoratives (every scene)

1. Radial glow, primary-tinted, slow scale 1.0 → 1.06.
2. Hairline rule(s) anchored to edge.
3. Mono section tag at top-left: `// 01 — PROBLEM`.
4. Optional: oversized ghost word, 320px+, `--fg` at 4% opacity, drifting.
5. Bottom-right brand mark: small Crest wave glyph + `crestai.dev` in mono.

## Don'ts (hard rules from user)

- NO purple, anywhere.
- NO emojis — use SVG Lucide-style glyphs or the Crest wave.
- NO gradient text.
- NO Inter, Poppins, or any banned grotesk.
- NO pure `#000` or `#fff`.

## Scene rhythm

`hook → punch → reveal → BUILD → BUILD → breathe → CTA`

Two shader/strong transitions: the Crest logo reveal (beat 2→3) and the CTA
sting (last beat). The rest is velocity-matched CSS blur cuts so the camera
feels continuous.
