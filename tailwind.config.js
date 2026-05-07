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
        // Multi-layer card shadow — creates real depth
        card: '0 0 0 1px rgba(64,56,51,0.06), 0 1px 2px rgba(64,56,51,0.04), 0 4px 10px rgba(64,56,51,0.07)',
        'card-hover': '0 0 0 1px rgba(64,56,51,0.08), 0 2px 6px rgba(64,56,51,0.06), 0 12px 24px rgba(64,56,51,0.10)',
        // Orange glow for primary CTA
        'orange': '0 4px 14px rgba(255,162,54,0.35)',
        'orange-lg': '0 6px 20px rgba(255,162,54,0.45)',
        // Subtle inner shadow for inputs
        'input': 'inset 0 1px 2px rgba(64,56,51,0.06)',
      },
      backgroundImage: {
        'gradient-cta': 'linear-gradient(to bottom, #ffb84d, #ffa236)',
        'gradient-header': 'linear-gradient(to bottom, #2e2219, #403833)',
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
};
