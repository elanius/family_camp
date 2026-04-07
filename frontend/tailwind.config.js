/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  corePlugins: {
    // Disable Tailwind's base reset to avoid conflicts with the existing global CSS.
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
