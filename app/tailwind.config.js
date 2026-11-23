/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      colors: {
        base: '#FAFAF7',
        sand: { DEFAULT: '#F3EFE6', dark: '#E8E1D3' },
        ink: { DEFAULT: '#2A2C28', soft: '#55574F', muted: '#8A8C83' },
        sage: { 50: '#F1F5EF', 100: '#E1EADD', 300: '#A9BFA2', 500: '#7A9871', 600: '#62805A', 700: '#4D6647' },
        warn: { bg: '#FBF3DA', DEFAULT: '#E3B94F', ink: '#8A6512' },
        alert: { bg: '#F8E7E4', DEFAULT: '#C4574C', ink: '#9A3B32' },
        line: '#ECEAE3',
      },
      borderRadius: { xl: '14px', '2xl': '20px', '3xl': '26px' },
      boxShadow: { card: '0 1px 2px rgba(42,44,40,.04), 0 4px 16px rgba(42,44,40,.04)', sheet: '0 -8px 40px rgba(42,44,40,.12)' },
    },
  },
  plugins: [],
}
