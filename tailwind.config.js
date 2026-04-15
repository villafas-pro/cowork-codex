/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sidebar
        sidebar: {
          bg: '#1a1a1a',
          hover: '#242424',
          active: '#2a2a2a',
          border: '#2e2e2e'
        },
        // Main surfaces
        surface: {
          0: '#141414',
          1: '#1e1e1e',
          2: '#242424',
          3: '#2a2a2a',
          4: '#333333'
        },
        // Text
        text: {
          primary: '#e5e5e5',
          secondary: '#a0a0a0',
          muted: '#666666'
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
          strong: '#404040'
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
