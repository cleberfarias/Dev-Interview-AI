/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './App.tsx', './index.tsx', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        fd: {
          primary: '#4F8CFF',
          secondary: '#8B5CF6',
          accent: '#22D3EE',
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
          bg: {
            main: '#0B0F1A',
            secondary: '#121826',
          },
          text: {
            primary: '#FFFFFF',
            secondary: '#A0AEC0',
            muted: '#6B7280',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Sora', 'Inter', 'sans-serif'],
      },
      backgroundImage: {
        'fd-gradient': 'linear-gradient(135deg, #22D3EE 0%, #4F8CFF 50%, #8B5CF6 100%)',
      },
      boxShadow: {
        'fd-glow': '0 0 20px rgba(139,92,246,0.3), 0 0 40px rgba(34,211,238,0.2)',
      },
    },
  },
  plugins: [],
};
