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
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace']
      }
    }
  },
  plugins: []
}
