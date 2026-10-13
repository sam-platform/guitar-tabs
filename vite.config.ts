import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Served from https://sam-echostate.github.io/guitar-tabs/ in production,
// so assets/manifest need a matching base path and relative start_url/scope.
const REPO_BASE = "/guitar-tabs/";

export default defineConfig(({ command }) => ({
  base: command === "build" ? REPO_BASE : "/",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "My Tabs",
        short_name: "Tabs",
        description: "Write and import your own guitar tabs.",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#14171c",
        theme_color: "#14171c",
        icons: [
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg}"],
      },
    }),
  ],
}));
