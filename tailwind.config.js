/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#e8b800',
          hover: '#f5c800',
          muted: '#e8b80033'
        },
        border: {
          DEFAULT: '#303030',
          strong: '#484848'
        },
        // Theme tokens — all backed by CSS variables, switch between light & dark automatically
        'th-bg-0': 'var(--th-bg-0)',  // near-black / darkest surface (sidebar strip, title bar)
        'th-bg-1': 'var(--th-bg-1)',  // toolbar, deep panel bg
        'th-bg-2': 'var(--th-bg-2)',  // main content area bg
        'th-bg-3': 'var(--th-bg-3)',  // input bg, modal bg
        'th-bg-4': 'var(--th-bg-4)',  // card bg
        'th-bg-5': 'var(--th-bg-5)',  // elevated / subtle surface
        'th-bg-6': 'var(--th-bg-6)',  // hover state bg
        'th-bd-1': 'var(--th-bd-1)',  // subtle border
        'th-bd-2': 'var(--th-bd-2)',  // default border
        'th-bd-3': 'var(--th-bd-3)',  // strong border
        'th-tx-1': 'var(--th-tx-1)',  // primary / heading text
        'th-tx-2': 'var(--th-tx-2)',  // body / secondary text
        'th-tx-3': 'var(--th-tx-3)',  // muted text
        'th-tx-4': 'var(--th-tx-4)',  // faint text
        'th-tx-5': 'var(--th-tx-5)',  // very faint text
        'th-tx-6': 'var(--th-tx-6)',  // ghost text (barely visible)
        'th-danger': 'var(--th-danger)', // danger tint bg (delete hover)
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
