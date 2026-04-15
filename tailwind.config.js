/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: '#080808',
          hover: '#1c1c1c',
          active: '#242424',
          border: '#1e1e1e'
        },
        surface: {
          0: '#0d0d0d',
          1: '#181818',
          2: '#202020',
          3: '#2c2c2c',
          4: '#383838'
        },
        text: {
          primary: '#f5f5f5',
          secondary: '#aaaaaa',
          muted: '#686868'
        },
        accent: {
          DEFAULT: '#c47b2b',
          hover: '#d48a35',
          muted: '#c47b2b33'
        },
        border: {
          DEFAULT: '#303030',
          strong: '#484848'
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
