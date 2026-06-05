import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Relative base so the built site works when served from any path (e.g. preview
// or a static file server), mirroring the original no-build dashboard.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: { port: 5199, strictPort: false },
  preview: { port: 5199, strictPort: false },
  // ECharts is bundled (offline, no CDN), which legitimately exceeds the 500 kB
  // default warning threshold — raise it rather than code-split a local tool.
  build: { chunkSizeWarningLimit: 1500 },
});
