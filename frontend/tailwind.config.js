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
          card:    'rgba(255,255,255,0.72)',
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
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(10px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition:  '200% center' },
        },
        'liquid-shimmer': {
          '0%':   { backgroundPosition: '-300% center' },
          '100%': { backgroundPosition:  '300% center' },
        },
        'pulse-soft': {
          '0%,100%': { opacity: '1' },
          '50%':     { opacity: '0.6' },
        },
        'spin-slow': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-4px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%':      { opacity: '0.8', transform: 'scale(1.08)' },
        },
        'nav-active': {
          '0%':   { transform: 'scaleX(0)', opacity: '0' },
          '100%': { transform: 'scaleX(1)', opacity: '1' },
        },
      },
      animation: {
        'slide-in':       'slide-in-left 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        'fade-up':        'fade-up 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        'scale-in':       'scale-in 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        'slide-up':       'slide-up 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        'shimmer':        'shimmer 2.5s linear infinite',
        'liquid-shimmer': 'liquid-shimmer 3s linear infinite',
        'pulse-soft':     'pulse-soft 2s ease-in-out infinite',
        'spin-slow':      'spin-slow 1.2s linear infinite',
        'float':          'float 3s ease-in-out infinite',
        'glow-pulse':     'glow-pulse 2.5s ease-in-out infinite',
      },
      boxShadow: {
        'glass':      '0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04), inset 0 1.5px 0 rgba(255,255,255,0.92)',
        'glass-lg':   '0 12px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06), inset 0 1.5px 0 rgba(255,255,255,0.92)',
        'glass-xl':   '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08), inset 0 1.5px 0 rgba(255,255,255,0.88)',
        'liquid':     '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04), inset 0 1.5px 0 rgba(255,255,255,0.98), inset 0 -1px 0 rgba(0,0,0,0.03)',
        'liquid-lg':  '0 16px 48px rgba(0,0,0,0.11), 0 4px 12px rgba(0,0,0,0.06), inset 0 1.5px 0 rgba(255,255,255,0.98)',
        'btn':        '0 2px 8px rgba(0,122,255,0.25)',
        'btn-hover':  '0 4px 16px rgba(0,122,255,0.35)',
        'ios':        '0 1px 3px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
        'glow-blue':  '0 0 20px rgba(0,122,255,0.28), 0 0 8px rgba(0,122,255,0.14)',
        'glow-green': '0 0 20px rgba(52,199,89,0.24), 0 0 8px rgba(52,199,89,0.12)',
        'glow-purple':'0 0 20px rgba(88,86,214,0.24), 0 0 8px rgba(88,86,214,0.12)',
      },
      backdropBlur: {
        'ios': '20px',
        'liquid': '40px',
      },
      borderRadius: {
        'ios':    '16px',
        'ios-sm': '10px',
        'ios-lg': '22px',
        'ios-xl': '28px',
        'ios-2xl':'32px',
      },
    },
  },
  plugins: [],
}
