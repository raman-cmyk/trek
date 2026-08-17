import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // MapLibre spawns a module worker to decode tiles. Without this the chunk is
  // never emitted, the browser 404s on /assets/maplibre-gl-worker.mjs, and
  // every tile is decoded on the main thread instead — which is a large part
  // of why the map felt slow.
  worker: { format: "es" },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
});
