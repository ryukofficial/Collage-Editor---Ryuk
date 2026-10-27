/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Premium dark palette
        void:    '#000000',
        surface: '#000000',
        panel:   '#111113',
        card:    '#1c1c1e',
        border:  '#2c2c2e',
        muted:   '#232326',
        dim:     '#8e8e93',
        soft:    '#c7c7cc',
        text:    '#ffffff',
        bright:  '#ffffff',
        // Accent colors
        accent:  '#ff3d77',
        accentL: '#ff6b96',
        accentD: '#e0245e',
        gold:    '#f5c842',
        rose:    '#ff6b8a',
        teal:    '#2dd4bf',
        green:   '#22c55e',
        orange:  '#f97316',
      },
      fontFamily: {
        sans:  ['DM Sans', 'system-ui', 'sans-serif'],
        mono:  ['JetBrains Mono', 'monospace'],
        display: ['Syne', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow':    'none',
        'glow-lg': 'none',
        'inset':   'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")",
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-up':   'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        'slide-left': 'slideLeft 0.3s cubic-bezier(0.16,1,0.3,1)',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'spin-slow':  'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideLeft: { from: { opacity: 0, transform: 'translateX(8px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 10px rgba(108,99,255,0.2)' }, '50%': { boxShadow: '0 0 30px rgba(108,99,255,0.5)' } },
      },
    },
  },
  plugins: [],
}
