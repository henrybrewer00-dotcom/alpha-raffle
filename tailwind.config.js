/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        blue: {
          DEFAULT: '#0000EF',
          dark: '#0000C4',
          deep: '#00006B',
        },
        sky: '#47C4E6',
        paper: '#F8F8F8',
        ink: '#2D2D2D',
        mute: '#7A7A7A',
        line: '#E4E4E4',
      },
      fontFamily: {
        sans: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
