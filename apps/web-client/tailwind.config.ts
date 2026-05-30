import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'media',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/utils/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ---- Tokens de tema (cambian claro/oscuro vía CSS vars en tokens.css) ----
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        surface: {
          DEFAULT: 'var(--surface)',
          primary: 'var(--surface-primary)',
          secondary: 'var(--surface-secondary)',
          elevated: 'var(--surface-elevated)',
          panel: 'var(--surface-panel)',
          popover: 'var(--surface-popover)',
          muted: 'var(--surface-muted)',
          chat: 'var(--surface-chat)',
          message: 'var(--surface-message)',
        },
        dashboard: {
          background: 'var(--dashboard-background)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          inverse: 'var(--text-inverse)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          active: 'var(--accent-active)',
        },
        border: {
          DEFAULT: 'var(--border)',
          hover: 'var(--border-hover)',
          focus: 'var(--border-focus)',
        },
        input: {
          bg: 'var(--input-bg)',
          'bg-hover': 'var(--input-bg-hover)',
          border: 'var(--input-border)',
          'border-focus': 'var(--input-border-focus)',
          placeholder: 'var(--input-placeholder)',
        },
        brand: {
          white: 'var(--brand-white)',
          black: 'var(--brand-black)',
          google: 'var(--brand-google)',
          whatsapp: 'var(--brand-whatsapp)',
        },
        avatar: {
          blue: 'var(--avatar-blue)',
          success: 'var(--avatar-success)',
          purple: 'var(--avatar-purple)',
          warning: 'var(--avatar-warning)',
          danger: 'var(--avatar-danger)',
          cyan: 'var(--avatar-cyan)',
          indigo: 'var(--avatar-indigo)',
          pink: 'var(--avatar-pink)',
        },
        chart: {
          active: 'var(--chart-active)',
          success: 'var(--chart-success)',
          danger: 'var(--chart-danger)',
          warning: 'var(--chart-warning)',
          execution: 'var(--chart-execution)',
          axis: 'var(--chart-axis)',
        },
        badge: {
          success: {
            bg: 'var(--badge-success-bg)',
            text: 'var(--badge-success-text)',
          },
          danger: {
            bg: 'var(--badge-danger-bg)',
            text: 'var(--badge-danger-text)',
          },
          warning: {
            bg: 'var(--badge-warning-bg)',
            text: 'var(--badge-warning-text)',
          },
        },

        // ---- Escalas semánticas (constantes; reemplazan a red/emerald/amber/blue/zinc) ----
        danger: {
          DEFAULT: 'var(--danger-500)',
          50: 'var(--danger-50)',
          100: 'var(--danger-100)',
          200: 'var(--danger-200)',
          300: 'var(--danger-300)',
          400: 'var(--danger-400)',
          500: 'var(--danger-500)',
          600: 'var(--danger-600)',
          700: 'var(--danger-700)',
          800: 'var(--danger-800)',
          900: 'var(--danger-900)',
          950: 'var(--danger-950)',
        },
        success: {
          DEFAULT: 'var(--success-500)',
          50: 'var(--success-50)',
          100: 'var(--success-100)',
          200: 'var(--success-200)',
          300: 'var(--success-300)',
          400: 'var(--success-400)',
          500: 'var(--success-500)',
          600: 'var(--success-600)',
          700: 'var(--success-700)',
          800: 'var(--success-800)',
          900: 'var(--success-900)',
          950: 'var(--success-950)',
        },
        warning: {
          DEFAULT: 'var(--warning-500)',
          50: 'var(--warning-50)',
          100: 'var(--warning-100)',
          200: 'var(--warning-200)',
          300: 'var(--warning-300)',
          400: 'var(--warning-400)',
          500: 'var(--warning-500)',
          600: 'var(--warning-600)',
          700: 'var(--warning-700)',
          800: 'var(--warning-800)',
          900: 'var(--warning-900)',
          950: 'var(--warning-950)',
        },
        info: {
          DEFAULT: 'var(--info-500)',
          50: 'var(--info-50)',
          100: 'var(--info-100)',
          200: 'var(--info-200)',
          300: 'var(--info-300)',
          400: 'var(--info-400)',
          500: 'var(--info-500)',
          600: 'var(--info-600)',
          700: 'var(--info-700)',
          800: 'var(--info-800)',
          900: 'var(--info-900)',
          950: 'var(--info-950)',
        },
        neutral: {
          50: 'var(--neutral-50)',
          100: 'var(--neutral-100)',
          200: 'var(--neutral-200)',
          300: 'var(--neutral-300)',
          400: 'var(--neutral-400)',
          500: 'var(--neutral-500)',
          600: 'var(--neutral-600)',
          700: 'var(--neutral-700)',
          800: 'var(--neutral-800)',
          900: 'var(--neutral-900)',
          950: 'var(--neutral-950)',
        },
        // alias plano de compatibilidad (= danger). Migrar a `danger`.
        error: 'var(--error)',
        // Auth: fondo del panel de formulario (adaptativo)
        'auth-form-bg': 'var(--auth-form-bg)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      animation: {
        'spin-slow': 'spin 20s linear infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
