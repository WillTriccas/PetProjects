import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        burgundy: {
          DEFAULT: "#722F37",
          light: "#8C4550",
          dark: "#4E1F25",
        },
        cream: {
          DEFAULT: "#FBF7F0",
          dark: "#F1E9DC",
        },
        gold: {
          DEFAULT: "#C9A84C",
          light: "#DDC57E",
          dark: "#A6863A",
        },
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
