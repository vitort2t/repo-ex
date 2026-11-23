/** @type {import('tailwindcss').Config} */
// Identidade LAR. — azul profundo (estrutura), vinho (personalidade), ameixa (complemento),
// champanhe e branco (superfícies), taupe (detalhes). Verde/amarelo/vermelho só para estados.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Manrope Variable"', 'Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      colors: {
        base: '#FAF7F3',
        champagne: { DEFAULT: '#F4EDE5', dark: '#EADFD2' },
        taupe: { DEFAULT: '#CBB99F', light: '#E6DBCB', dark: '#8E7A5C' },
        navy: { 50: '#EEF1F5', 100: '#DCE3EC', 300: '#8A9BB0', 500: '#3A5272', 600: '#14263D', 700: '#0C1828' },
        wine: { 50: '#F7EEF1', 100: '#ECD6DE', 500: '#8A4A60', 600: '#642C40', 700: '#4C1F30' },
        plum: { 50: '#F4EFF2', 100: '#E8DEE4', 500: '#806071', 600: '#6A4E5E' },
        ink: { DEFAULT: '#18212E', soft: '#4B5363', muted: '#8B8F98' },
        ok: { bg: '#E6F2EA', DEFAULT: '#2F8A57', ink: '#1E6640' },
        warn: { bg: '#FBF1D6', DEFAULT: '#D9A93B', ink: '#7E5C0E' },
        alert: { bg: '#F8E5E3', DEFAULT: '#C2463D', ink: '#962F27' },
        line: '#ECE4DA',
      },
      borderRadius: { xl: '12px', '2xl': '16px', '3xl': '22px' },
      boxShadow: { card: '0 1px 2px rgba(20,38,61,.04), 0 6px 18px rgba(20,38,61,.04)', sheet: '0 -8px 40px rgba(20,38,61,.14)' },
    },
  },
  plugins: [],
}
