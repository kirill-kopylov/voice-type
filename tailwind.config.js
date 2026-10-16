/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        lux: {
          950: '#0a080c',
          900: '#0e0b10',
          850: '#13101a',
          800: '#18141e',
          750: '#1d1826',
          700: '#201a28',
          650: '#281f32',
          600: '#302540',
          500: '#3d3050',
          400: '#524468',
          300: '#6b5a82',
        },
        coral: {
          DEFAULT: '#e8725a',
          light: '#f0896e',
          dim: '#c45a44',
        },
        gold: {
          DEFAULT: '#f97316',
          light: '#fb923c',
        },
        cream: {
          DEFAULT: '#f0ebe4',
          light: '#f7f3ed',
          dim: '#c0b8ae',
          muted: '#a09690',
        },
        sage: {
          DEFAULT: '#8a7f90',
          dark: '#5e5466',
          deep: '#3d3444',
          mist: '#2d2436',
        }
      },
      animation: {
        'pulse-recording': 'pulse-recording 1.5s ease-in-out infinite',
        'rise-in': 'rise-in 180ms ease-out',
      },
      keyframes: {
        'pulse-recording': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.1)' }
        },
        // Через translate, а не transform: не сбивает -translate-x-1/2 у элементов по центру
        'rise-in': {
          from: { opacity: '0', translate: '0 6px' },
          to: { opacity: '1', translate: '0 0' }
        },
      }
    }
  },
  plugins: []
}
