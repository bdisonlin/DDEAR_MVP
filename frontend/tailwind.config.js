/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ios: {
          blue:   '#007AFF',
          green:  '#34C759',
          orange: '#FF9500',
          red:    '#FF3B30',
          purple: '#AF52DE',
          teal:   '#5AC8FA',
          indigo: '#5856D6',
          pink:   '#FF2D55',
          yellow: '#FFCC00',
          gray1:  '#8E8E93',
          gray2:  '#AEAEB2',
          gray3:  '#C7C7CC',
          gray4:  '#D1D1D6',
          gray5:  '#E5E5EA',
          gray6:  '#F2F2F7',
        },
        brand:   { DEFAULT: '#007AFF', dark: '#0071e3' },
        success: '#34C759',
        warning: '#FF9500',
        danger:  '#FF3B30',
        surface: {
          DEFAULT: '#f5f5f7',
          card:    'rgba(255,255,255,0.75)',
          border:  'rgba(0,0,0,0.08)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['SF Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
      keyframes: {
        'slide-in-left': {
          '0%':   { transform: 'translateX(-16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)',     opacity: '1' },
        },
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition:  '200% center' },
        },
        'pulse-soft': {
          '0%,100%': { opacity: '1' },
          '50%':     { opacity: '0.6' },
        },
        'spin-slow': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'slide-in':    'slide-in-left 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        'fade-up':     'fade-up 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        'scale-in':    'scale-in 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        'shimmer':     'shimmer 2.5s linear infinite',
        'pulse-soft':  'pulse-soft 2s ease-in-out infinite',
        'spin-slow':   'spin-slow 1.2s linear infinite',
      },
      boxShadow: {
        'glass':     '0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)',
        'glass-lg':  '0 12px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
        'glass-xl':  '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
        'btn':       '0 2px 8px rgba(0,122,255,0.25)',
        'btn-hover': '0 4px 16px rgba(0,122,255,0.35)',
        'ios':       '0 1px 3px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
      },
      backdropBlur: {
        'ios': '20px',
      },
      borderRadius: {
        'ios': '16px',
        'ios-sm': '10px',
        'ios-lg': '22px',
        'ios-xl': '28px',
      },
    },
  },
  plugins: [],
}
