import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite-plus";
import pkg from "./package.json" with { type: "json" };

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  base: process.env.VITE_APP_BASE_PATH || "/",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    allowedHosts: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "icons/favicon.svg",
        "icons/favicon.ico",
        "icons/apple-touch-icon.png",
        "icons/cloakyard.svg",
        "icons/logo.svg",
      ],
      manifest: {
        name: "CloakIMG",
        short_name: "CloakIMG",
        description:
          "A minimal photo editor that respects your photos. Crop, retouch, redact, adjust, filter, frame and export — entirely in your browser.",
        theme_color: "#f5613a",
        background_color: "#faf7f4",
        display: "standalone",
        orientation: "any",
        scope: process.env.VITE_APP_BASE_PATH || "/",
        start_url: process.env.VITE_APP_BASE_PATH || "/",
        icons: [
          {
            src: "icons/pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "icons/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          // Screenshots taken from Chrome Dev Tools. Actual resolution may vary.
          // iPhone 14 Pro Max (Portrait)
          {
            src: "screenshots/iPhone.png",
            sizes: "1290x2796",
            type: "image/png",
            form_factor: "narrow",
            label: "CloakIMG App on iPhone 14 Pro Max",
          },
          // iPad Pro (Landscape)
          {
            src: "screenshots/iPad.png",
            sizes: "2732x2048",
            type: "image/png",
            form_factor: "wide",
            label: "CloakIMG App on iPad Pro Landscape",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // libheif's WASM bundle is ~1.4MB and only loads when a user
        // opens a HEIC/HEIF — pre-caching it would bloat first-install
        // by ~half a meg gzipped for everyone. Excluded here; the
        // browser caches it on first use through normal HTTP caching.
        globIgnores: ["**/wasm-bundle-*.js"],
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        navigationPreload: true,
        runtimeCaching: [
          // Google Fonts stylesheet — small, versioned, fetched on
          // every cold load via index.html. StaleWhileRevalidate keeps
          // the app usable offline once visited.
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts files (woff2) — immutable per URL, so
          // CacheFirst with a long TTL is safe.
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    ignorePatterns: ["handoff-readonly/**"],
    options: { typeAware: true, typeCheck: true },
  },
});
