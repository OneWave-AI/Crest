/** @type {import('tailwindcss').Config} */
module.exports = {
  // src/shared is scanned too: provider configs carry their own accent classes,
  // and a class that only ever appears there would otherwise be purged.
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}',
    './src/shared/**/*.{js,ts}'
  ],
  theme: {
    extend: {
      colors: {
        // Every value below that a theme needs to change resolves through a
        // CSS channel variable declared in globals.css, so a theme is a block
        // of variable overrides rather than a second set of class names.
        overlay: 'rgb(var(--c-overlay) / <alpha-value>)',
        ink: {
          bright: 'rgb(var(--c-ink-bright) / <alpha-value>)',
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          muted: 'rgb(var(--c-ink-muted) / <alpha-value>)',
          subtle: 'rgb(var(--c-ink-subtle) / <alpha-value>)',
          faint: 'rgb(var(--c-ink-faint) / <alpha-value>)',
          ghost: 'rgb(var(--c-ink-ghost) / <alpha-value>)',
          trace: 'rgb(var(--c-ink-trace) / <alpha-value>)',
          void: 'rgb(var(--c-ink-void) / <alpha-value>)'
        },
        surface: {
          void: 'rgb(var(--c-surface-void) / <alpha-value>)',
          0: 'rgb(var(--c-surface-0) / <alpha-value>)',
          1: 'rgb(var(--c-surface-1) / <alpha-value>)',
          2: 'rgb(var(--c-surface-2) / <alpha-value>)',
          3: 'rgb(var(--c-surface-3) / <alpha-value>)',
          4: 'rgb(var(--c-surface-4) / <alpha-value>)',
          5: 'rgb(var(--c-surface-5) / <alpha-value>)',
          6: 'rgb(var(--c-surface-6) / <alpha-value>)',
          7: 'rgb(var(--c-surface-7) / <alpha-value>)',
          // Legacy names, still referenced by older components.
          DEFAULT: '#1a1a1a',
          elevated: '#242424',
          hover: '#2a2a2a',
          border: '#333333'
        },
        // Status. Small set on purpose -- a colour that means something
        // should mean it everywhere.
        danger: '#E5484D',
        // The human's own turn in a transcript -- the one place a cool tone
        // earns its place, because it has to read as "not the agent".
        human: { DEFAULT: '#2a4a6a', bubble: '#1e3a5f' },
        // macOS window-control colours. Fixed by the platform, not ours to
        // theme, which is why they are named rather than tokenised.
        mac: { close: '#ff5f56', minimize: '#ffbd2e', zoom: '#27ca40' },
        // Primary accent. Four different terracottas were in circulation as
        // inline hex before this ramp existed -- #e8956e, #d68a6e, #cc785c,
        // #b86a50 and #a55d45 all shipped as "the accent" in different files.
        // They are now numbered, so "one step darker on hover" is a decision
        // the palette makes once instead of a value each component picks.
        accent: {
          300: '#e8956e',
          400: '#d68a6e',
          DEFAULT: '#cc785c',
          500: '#cc785c',
          600: '#b86a50',
          700: '#a55d45',
          hover: '#d68a6e',
          muted: 'rgba(204, 120, 92, 0.1)'
        },
        // Secondary accent. Carries active state, agent/bot identity and the
        // fourth data series -- everywhere the old purple did. Warm gold reads
        // as a deliberate pair with the terracotta primary; the two never sit
        // at the same value, so state stays legible against action.
        sand: {
          100: '#f4efe6',
          200: '#e9dfcc',
          300: '#dccdb0',
          400: '#cfbb97',
          500: '#c2a87e',
          600: '#a98d61',
          700: '#8a7149',
          800: '#5f4e33',
          900: '#3a301f'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace']
      }
    }
  },
  plugins: []
}
