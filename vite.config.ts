import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

function getBasePath(): string {
  const configured = process.env.VITE_BASE_PATH?.trim();
  if (configured) {
    return configured.endsWith("/") ? configured : `${configured}/`;
  }

  const repository = process.env.GITHUB_REPOSITORY?.split("/").at(-1);
  return repository ? `/${repository}/` : "./";
}

export default defineConfig({
  base: getBasePath(),
  plugins: [
    preact(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["assets/placeholder-equipment.svg"],
      manifest: {
        name: "HD2 军需簿",
        short_name: "HD2 军需簿",
        description: "非官方、离线优先的 HELLDIVERS 2 装备速查与解锁计划工具。",
        lang: "zh-CN",
        start_url: "./",
        scope: "./",
        display: "standalone",
        theme_color: "#0b1118",
        background_color: "#0b1118",
        icons: [
          {
            src: "icons/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
          {
            src: "icons/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,json,ico}"],
      },
    }),
  ],
});
