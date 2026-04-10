/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // BBA brand palette — mirrored in /shared/constants.BRAND_COLORS for backend use.
        brand: {
          primary: '#E8593C', // BBA orange — CTAs, highlights, brand marks
          'primary-dark': '#C7482E',
          'primary-light': '#FFE6DE',
          secondary: '#1A1A2E', // Dark navy — headings, nav
          background: '#FFFFFF',
          surface: '#F5F5F5',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 3px rgba(26, 26, 46, 0.08), 0 1px 2px rgba(26, 26, 46, 0.04)',
        'card-hover': '0 4px 12px rgba(26, 26, 46, 0.12)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
};
