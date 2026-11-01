import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The static demo is served from https://<user>.github.io/crosscheck/, so it needs that base path.
// Everything else (dev server, Docker) serves from the root and proxies /api to the backend.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: { "/api": process.env.API_URL ?? "http://localhost:8000" },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
