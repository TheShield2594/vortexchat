import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Discord-like dark theme
        'vortex': {
          'bg-primary': '#313338',    // main content bg
          'bg-secondary': '#2b2d31',  // channel list bg
          'bg-tertiary': '#1e1f22',   // server list bg
          'bg-overlay': '#232428',    // modals, overlays
          'interactive': '#949ba4',   // icons, inactive
          'interactive-hover': '#dbdee1', // hover state
          'text-primary': '#f2f3f5',
          'text-secondary': '#b5bac1',
          'text-muted': '#4e5058',
          'accent': '#5865f2',        // blurple
          'accent-hover': '#4752c4',
          'success': '#23a55a',
          'warning': '#f0b132',
          'danger': '#f23f43',
          'link': '#00a8fc',
          'mention': '#5865f233',
          'mention-border': '#5865f2',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "speaking-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(35, 165, 90, 0.4)" },
          "50%": { boxShadow: "0 0 0 4px rgba(35, 165, 90, 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "speaking-pulse": "speaking-pulse 1s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
