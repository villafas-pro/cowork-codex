/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sidebar
        sidebar: {
          bg: '#111111',
          hover: '#1e1e1e',
          active: '#252525',
          border: '#222222'
        },
        // Main surfaces
        surface: {
          0: '#0f0f0f',
          1: '#1a1a1a',
          2: '#212121',
          3: '#2a2a2a',
          4: '#363636'
        },
        // Text
        text: {
          primary: '#f0f0f0',
          secondary: '#b0b0b0',
          muted: '#707070'
        },
        // Accent (warm amber like Claude)
        accent: {
          DEFAULT: '#c47b2b',
          hover: '#d48a35',
          muted: '#c47b2b33'
        },
        // Borders
        border: {
          DEFAULT: '#2e2e2e',
          strong: '#444444'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['Cascadia Code', 'Fira Code', 'Consolas', 'monospace']
      },
      borderRadius: {
        DEFAULT: '6px'
      }
    }
  },
  plugins: []
}
