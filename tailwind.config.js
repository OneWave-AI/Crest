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
        // Dark theme colors matching V1
        surface: {
          DEFAULT: '#1a1a1a',
          elevated: '#242424',
          hover: '#2a2a2a',
          border: '#333333'
        },
        accent: {
          DEFAULT: '#cc785c',
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
