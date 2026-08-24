/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        morandi: {
          bg: '#F7F6F2',
          card: '#FFFFFF',
          darkBg: '#141517',
          darkCard: '#1F2023',
          darkSubtle: '#292B2F',
          primary: '#4A5568',
          secondary: '#718096',
          accent: '#5E81AC',
          expense: '#D08770',
          income: '#A3BE8C',
          transfer: '#88C0D0',
          loan: '#EBCB8B',
        },
        neutral: {
          750: '#26272B',
          850: '#1B1C1E',
          950: '#0F1011',
        }
      },
      keyframes: {
        modalIn: {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        toastIn: {
          '0%': { opacity: '0', transform: 'translateY(-12px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        popIn: {
          '0%': { transform: 'scale(0.9)' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
        subtlePulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.75' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'modal-in': 'modalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'toast-in': 'toastIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pop-in': 'popIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'subtle-pulse': 'subtlePulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s infinite linear',
      },
      boxShadow: {
        'glow-indigo': '0 0 20px -3px rgba(99, 102, 241, 0.35)',
        'glow-emerald': '0 0 20px -3px rgba(163, 190, 140, 0.35)',
        'glow-amber': '0 0 20px -3px rgba(235, 203, 139, 0.35)',
        'glow-orange': '0 0 20px -3px rgba(208, 135, 112, 0.35)',
      },
    },
  },
  plugins: [],
}
