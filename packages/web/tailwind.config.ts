import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

// Custom colors created with https://uicolors.app/create

export default {
  content: ["./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      black: colors.black,
      white: colors.white,
      // HSL 170 3% 44%
      gray: {
        "50": "#f5f6f6",
        "100": "#e6e7e7",
        "200": "#cfd2d1",
        "300": "#aeb2b0",
        "400": "#858b89",
        "500": "#6d7472",
        "600": "#5a605e",
        "700": "#4d5150",
        "800": "#434746",
        "900": "#3b3e3e",
        "950": "#252727",
      },
      neutral: colors.neutral,
      red: colors.red,
      yellow: colors.yellow,
      green: colors.green,
      blue: colors.blue,
      // HSL 170 41% 33%
      brand: {
        "50": "#f3faf7",
        "100": "#d8efe8",
        "200": "#b1ded1",
        "300": "#82c6b5",
        "400": "#58a998",
        "500": "#3e8e7e",
        "600": "#32776b",
        "700": "#295c54",
        "800": "#254a45",
        "900": "#223f3b",
        "950": "#0f2421",
      },
    },
  },
  plugins: [],
} satisfies Config;
