/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm off-white backgrounds
        surface: {
          50: '#faf9f7',
          100: '#f5f3ef',
          200: '#eceae4',
        },
        // Deep charcoal text
        ink: {
          900: '#1a1917',
          700: '#3d3b37',
          500: '#6b6860',
          400: '#c8c5bf',
          300: '#a09d97',
        },
        // Emerald/teal primary accent
        emerald: {
          50: '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
        },
        // Amber for "needs review"
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          900: '#78350f',
        },
        // Red only for true errors
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
        'card-elevated': '0 8px 24px 0 rgb(0 0 0 / 0.10)',
        'glow-emerald': '0 0 20px 4px rgb(5 150 105 / 0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-up-delay-1': 'slideUp 0.35s ease-out 0.05s both',
        'slide-up-delay-2': 'slideUp 0.35s ease-out 0.10s both',
        'slide-up-delay-3': 'slideUp 0.35s ease-out 0.15s both',
        'slide-up-delay-4': 'slideUp 0.35s ease-out 0.20s both',
        'slide-up-delay-5': 'slideUp 0.35s ease-out 0.25s both',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'spin-slow': 'spin 2s linear infinite',
        shimmer: 'shimmer 1.8s infinite linear',
        'bounce-in': 'bounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'scale-in': 'scaleIn 0.2s ease-out',
        'count-up': 'fadeIn 0.6s ease-out',
        'ring-spin': 'ringSpin 1.2s linear infinite',
        'ring-spin-slow': 'ringSpin 2.4s linear infinite',
        'confetti-drop': 'confettiDrop 0.6s ease-out forwards',
        'check-pop': 'checkPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        shimmer: {
          '0%': { backgroundPosition: '-600px 0' },
          '100%': { backgroundPosition: '600px 0' },
        },
        bounceIn: {
          from: { opacity: '0', transform: 'scale(0.85)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        ringSpin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        confettiDrop: {
          '0%': { opacity: '0', transform: 'translateY(-20px) scale(0)' },
          '60%': { opacity: '1', transform: 'translateY(4px) scale(1.1)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        checkPop: {
          '0%': { transform: 'scale(0) rotate(-45deg)', opacity: '0' },
          '70%': { transform: 'scale(1.2) rotate(5deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
