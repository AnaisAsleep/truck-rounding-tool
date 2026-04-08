/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        emma: {
          dark:    '#403833',
          accent:  '#ffa236',
          light:   '#fff8f0',
          bg:      '#fafaf8',
          border:  '#e8e0db',
          muted:   '#8a7e78',
          card:    '#ffffff',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(64,56,51,0.08), 0 1px 2px rgba(64,56,51,0.06)',
      },
    },
  },
  plugins: [],
};
