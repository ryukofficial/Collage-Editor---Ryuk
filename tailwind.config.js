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
        void:    '#050507',
        surface: '#0d0d12',
        panel:   '#12121a',
        card:    '#1a1a26',
        border:  '#252535',
        muted:   '#2e2e42',
        dim:     '#4a4a6a',
        soft:    '#7a7a9a',
        text:    '#c8c8e8',
        bright:  '#eeeef8',
        // Accent colors
        accent:  '#6c63ff',
        accentL: '#8b85ff',
        accentD: '#4a44cc',
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
        'glow':    '0 0 20px rgba(108,99,255,0.3)',
        'glow-lg': '0 0 40px rgba(108,99,255,0.4)',
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
