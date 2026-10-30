import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The router plugin generates src/routeTree.gen.ts from src/routes and must run before React.
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  server: {
    port: 5173,
    // Same origin as in production, where nginx proxies /api to partners-api.
    proxy: { "/api": "http://localhost:4000" },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
