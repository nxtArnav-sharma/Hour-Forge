/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/renderer/**/*.{html,js,ts,jsx,tsx}',
    './src/renderer/index.html'
  ],
  theme: {
    extend: {
      colors: {
        background: '#080B11',
        surface: 'rgba(16, 22, 34, 0.7)',
        elevated: 'rgba(23, 31, 48, 0.75)',
        border: 'rgba(255, 255, 255, 0.08)',
        glass: {
          base: 'rgba(12, 16, 26, 0.75)',
          card: 'rgba(18, 25, 39, 0.65)',
          cardHover: 'rgba(24, 34, 53, 0.75)',
          pill: 'rgba(255, 255, 255, 0.05)',
          border: 'rgba(255, 255, 255, 0.08)',
          highlight: 'rgba(255, 255, 255, 0.15)'
        },
        text: {
          DEFAULT: '#F1F5F9',
          secondary: '#94A3B8',
          muted: '#64748B'
        },
        accent: {
          purple: '#8B5CF6',
          violet: '#7C3AED',
          cyan: '#06B6D4',
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#F43F5E'
        },
        state: {
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          info: '#38BDF8',
          blocked: '#FB923C'
        }
      },
      boxShadow: {
        'glass-sm': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 0 2px 8px 0 rgba(0, 0, 0, 0.3)',
        'glass': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.12), 0 8px 24px 0 rgba(0, 0, 0, 0.35)',
        'glass-lg': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.15), 0 12px 32px 0 rgba(0, 0, 0, 0.45)',
        'neon-purple': '0 0 20px -2px rgba(139, 92, 246, 0.35)',
        'neon-cyan': '0 0 20px -2px rgba(6, 182, 212, 0.35)',
        'neon-emerald': '0 0 20px -2px rgba(16, 185, 129, 0.35)'
      },
      borderRadius: {
        card: '16px',
        control: '12px'
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    }
  },
  plugins: []
};

