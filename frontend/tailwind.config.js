/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Pure white and soft lavender surfaces
        surface: {
          50: '#ffffff',
          100: '#faf8ff',
          200: '#f3f0fc',
        },
        // Modern crisp slate/ink text
        ink: {
          900: '#0f172a',
          700: '#334155',
          500: '#64748b',
          400: '#94a3b8',
          300: '#cbd5e1',
        },
        // Rich purple & violet gradient palette
        purple: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
        },
        // Emerald mapped to purple palette for seamless global theme compatibility
        emerald: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          400: '#c084fc',
          500: '#a855f7',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#581c87',
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
        card: '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.03)',
        'card-hover': '0 8px 24px -4px rgba(124, 58, 237, 0.1), 0 2px 6px -2px rgba(0, 0, 0, 0.04)',
        'card-elevated': '0 12px 32px -4px rgba(124, 58, 237, 0.12)',
        'glow-emerald': '0 0 25px 4px rgba(124, 58, 237, 0.22)',
        'glow-purple': '0 0 25px 4px rgba(124, 58, 237, 0.22)',
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
        'slide-from-right': 'slideFromRight 0.3s ease-out',
        'slide-from-left': 'slideFromLeft 0.3s ease-out',
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
        slideFromRight: {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        slideFromLeft: {
          from: { opacity: '0', transform: 'translateX(-24px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
