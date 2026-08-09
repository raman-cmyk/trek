import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Kept separate from vite.config.ts: unit tests target the pure /app/lib
// modules (pricing, policy, mask) and must not load the React Router or
// Cloudflare Vite plugins.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
