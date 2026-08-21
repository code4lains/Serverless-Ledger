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
          darkBg: '#18191A',
          darkCard: '#242526',
          primary: '#4A5568',
          secondary: '#718096',
          accent: '#5E81AC',
          expense: '#D08770',
          income: '#A3BE8C',
          transfer: '#88C0D0',
          loan: '#EBCB8B',
        }
      }
    },
  },
  plugins: [],
}
