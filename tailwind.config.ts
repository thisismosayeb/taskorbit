import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#6658F5",
        cyanbrand: "#16C8E8",
        violet: "#A36BFA",
        mint: "#2DD4BF",
        coral: "#FF7D70",
        background: "var(--background)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        roleaccent: "var(--role-accent)",
        roleaccent2: "var(--role-accent-2)",
      },
      fontFamily: {
        heading: ["var(--font-heading)", "Space Grotesk", "sans-serif"],
        body: ["var(--font-body)", "Inter", "sans-serif"],
        bangla: ["var(--font-bangla)", "Hind Siliguri", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
