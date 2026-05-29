/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Cobalt Sky — clearly distinct surface layers
        cs: {
          base:     "#03051E",  // deepest background (near-black navy)
          surface:  "#0A0F3D",  // sidebars / top bar (visible navy)
          card:     "#111A5E",  // bubbles, inputs, cards (medium navy)
          hover:    "#1A2878",  // hover & active states (brighter navy)
          border:   "#2A3F9A",  // borders (visible cobalt-tinted)
          cobalt:   "#0047AB",  // primary: buttons, user bubbles, active item
          cobaltHi: "#1A5DC8",  // button hover (lighter cobalt)
          navy:     "#000080",  // deep accent
          sky:      "#82C8E5",  // icons, secondary text, accents
          steel:    "#6D8196",  // muted / dim text
          text:     "#EEF4FF",  // primary text (near-white)
          text2:    "#B8D4F0",  // secondary text (cool blue-white)
          dim:      "#5A7080",  // very muted footer text
        },
        // Status colours (unchanged)
        verified:     "#22c55e",
        hallucinated: "#ef4444",
        retracted:    "#f97316",
        preprint:     "#eab308",
        unverifiable: "#6b7280",
      },
      backgroundImage: {
        "cobalt-glow": "linear-gradient(135deg, #0047AB 0%, #000080 100%)",
        "sky-fade":    "linear-gradient(180deg, #0A0F3D 0%, #03051E 100%)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
