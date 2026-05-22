---
name: website-to-hyperframes
description: Capture a website and create a HyperFrames video from it. Use whenever the user (1) provides a URL and wants a video, (2) says "capture this site", "turn this into a video", "make a video tour of this page", or (3) wants a scrolling product walkthrough, marketing reel, or before/after visual built from a real site.
---

# Website → HyperFrames

Turn any URL into a video composition. The skill captures screenshots
(full-page, viewport, or scroll-through), assembles them as scenes in a
HyperFrames project, and lets the user render the result.

## When to use

The user gives you a URL and any of:

- "Make a video"
- "Turn this site into a reel / short / promo"
- "Show this page scrolling"
- "Capture this and animate it"
- "Build a before/after with these two URLs"

Also: when the user is pitching their product and needs a demo video fast.

## Workflow

1. **Confirm the goal** — quick title card, scrolling walkthrough, feature
   highlights, or before/after? Length and aspect ratio matter — ask
   before scaffolding.

2. **Scaffold a HyperFrames project** — `npx hyperframes init --tailwind`
   in a fresh directory.

3. **Capture the site**. Use whatever is available in the environment:
   - Playwright is the most reliable (HyperFrames already bundles it).
     Drive `page.goto(url)` then `page.screenshot({ fullPage: true })` for
     full-page captures, or scroll-and-snap for a walkthrough.
   - Save captures to the project's `assets/` directory.

4. **Compose**. Typical templates:
   - **Title + scroll + outro** — 1s title, 8s scrolling capture, 1s CTA
   - **Feature reel** — 1s intro, 3-4 zoom-and-pan shots on key sections,
     1s outro. Use GSAP for the camera-style motion.
   - **Before/after** — split-screen with a wipe transition between two
     captures of the same URL at different states.

5. **Lint + render** — `npx hyperframes lint`, then
   `npx hyperframes render`. Vertical for social, 16:9 for embed.

## Defaults to recommend

- **Length**: 8–15s for social, 20–30s for product demo, 60s+ for full
  walkthrough
- **Aspect**: 9:16 (1080x1920) for TikTok / Reels / Shorts; 16:9
  (1920x1080) for embed; 1:1 (1080x1080) for feed
- **Capture viewport**: 1440x900 for most marketing sites — closer to how
  desktop visitors see them than the full retina 1920x1080
- **Add a CTA card** at the end: 1.5s with the URL and a "Visit"
  prompt. Free conversion.

## Things to handle gracefully

- **Cookie banners / popups** — dismiss before capturing. A 500ms wait
  after `page.goto` and a click on common dismiss buttons (`button[id*="accept"]`,
  `button:has-text("Accept")`) covers most cases.
- **Lazy-loaded content** — scroll the page once before capturing to
  trigger any intersection observers, then scroll back to top.
- **Animations on the page** — disable them in the capture by injecting
  CSS: `* { animation: none !important; transition: none !important; }`.
  This avoids capturing a half-rendered state.
- **Auth-walled pages** — ask the user whether they want to log in first
  (use `page.context().addCookies(...)` or persistent storage state).

## Adjacent skills

- **hyperframes** — main composition skill, load it for the actual scene
  authoring
- **hyperframes-cli** — for CLI commands during the build
- **hyperframes-media** — if the user wants voiceover narrating the tour

## Minimal example: title + scroll + outro

After scaffolding, the composition looks roughly like:

```html
<!doctype html>
<html data-duration="10000">
  <head><link rel="stylesheet" href="https://cdn.tailwindcss.com" /></head>
  <body class="bg-black">
    <!-- title -->
    <div class="absolute inset-0 grid place-items-center text-white"
         data-start="0" data-end="1500">
      <h1 class="text-6xl font-bold">acme.com</h1>
    </div>

    <!-- scrolling capture -->
    <img src="./assets/fullpage.png"
         class="absolute inset-x-0 top-0 w-full"
         data-start="1500" data-end="9000"
         data-animate-y="0,-2000" />

    <!-- CTA -->
    <div class="absolute inset-0 grid place-items-center text-white bg-black/80"
         data-start="9000" data-end="10000">
      <p class="text-3xl">Visit acme.com</p>
    </div>
  </body>
</html>
```

Then `npx hyperframes render`. Done.
