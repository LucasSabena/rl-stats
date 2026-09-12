import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Static marketing site for RL Stats.
// `base: "./"` keeps every asset URL relative, so the same build works at the
// domain root (local preview) and under a repository subpath (GitHub Pages)
// without a rebuild.
const base = process.env.LANDING_BASE ?? "./";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  server: {
    port: 1430,
    strictPort: true,
  },
});
