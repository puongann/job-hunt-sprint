/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        maroon: '#7E1D18',
        paper: '#FFF8EC',
        ink: '#2A1514',
        cork: '#C9A66B',
        hired: '#2E7D4F',
        maybe: '#E0A100',
        rejected: '#C0392B',
        teamA: '#3B4CCA',
        teamB: '#E8590C',
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        hand: ['Caveat', 'cursive'],
      },
    },
  },
  plugins: [],
};
