import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          light: "#f4f5f7",
          dark: "#1a1b1e",
        },
      },
    },
  },
  plugins: [],
};

export default config;
