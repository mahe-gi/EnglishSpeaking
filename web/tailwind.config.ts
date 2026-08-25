import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#FFFFFF",
        surface: "#F9FAFB",
        textPrimary: "#111827",
        textSecondary: "#4B5563",
        border: "#E5E7EB",
        accent: "#111827",
      },
    },
  },
  plugins: [],
};
export default config;
