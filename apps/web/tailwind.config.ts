import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pitch: "var(--pitch)",
        surface: "var(--surface)",
        raised: "var(--surface-raised)",
        line: "var(--line)",
        "line-bright": "var(--line-bright)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        "ink-faint": "var(--ink-faint)",
        gold: "var(--gold)",
        cool: "var(--cool)",
        win: "var(--win)",
        "win-muted": "var(--win-muted)",
        loss: "var(--loss)",
        "loss-muted": "var(--loss-muted)",
        live: "var(--live)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        condensed: ["Barlow Condensed", "Inter", "sans-serif"],
      },
      boxShadow: {
        "gold-glow": "0 0 14px var(--gold-glow)",
      },
    },
  },
  plugins: [],
} satisfies Config;
