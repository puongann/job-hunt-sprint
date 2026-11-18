/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        maroon: '#B3261E',
        paper: '#FFF8EC',
        ink: '#2A1514',
        cork: '#EAD7AE',
        hired: '#1F9D55',
        maybe: '#F2B200',
        rejected: '#E04535',
        teamA: '#4A5FE8',
        teamB: '#F76B15',
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        hand: ['Nunito', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
