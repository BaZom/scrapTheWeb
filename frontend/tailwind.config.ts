import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f7f6f3",
        surface: "#ffffff",
        ink: {
          DEFAULT: "#0d0e0c",
          soft: "#535350",
          muted: "#8e8d88"
        },
        rule: {
          DEFAULT: "#e7e5df",
          strong: "#cdc9bf"
        },
        accent: {
          DEFAULT: "#0d3a2a",
          soft: "#1a5b41",
          tint: "#dbe6df"
        },
        success: "#16624a",
        warning: "#b07d1c",
        danger: "#9c2a1a"
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      letterSpacing: {
        wider2: "0.18em"
      },
      borderRadius: {
        DEFAULT: "6px",
        md: "6px",
        lg: "10px",
        xl: "14px"
      },
      boxShadow: {
        hairline: "0 0 0 1px rgba(13,14,12,0.05)",
        soft: "0 1px 2px rgba(13,14,12,0.06), 0 8px 24px -16px rgba(13,14,12,0.08)"
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        rise: "rise 420ms cubic-bezier(0.2,0.7,0.2,1) both"
      }
    }
  },
  plugins: []
};

export default config;
