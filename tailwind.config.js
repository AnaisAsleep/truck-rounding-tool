/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Emma Sleep brand colors
        emma: {
          dark: '#403833',      // Primary dark: headers, nav, primary text
          accent: '#ffa236',    // Primary accent: buttons, active states
          light: '#fff3e0',     // Accent light: hover states, backgrounds
          success: '#4caf50',   // Confirmed trucks, good utilization
          warning: '#ff9800',   // Borderline trucks, medium utilization
          danger: '#f44336',    // Cut trucks, errors, low utilization
          bg: '#fafafa',        // Page background
          card: '#ffffff',      // Card/panel background
          textPrimary: '#403833',
          textSecondary: '#8a7e78',
          border: '#e8e0db',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        card: '8px',
        btn: '6px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(64, 56, 51, 0.1)',
        'card-hover': '0 4px 12px rgba(64, 56, 51, 0.15)',
      },
    },
  },
  plugins: [],
};
