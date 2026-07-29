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
  // Pre-bundle the heavy, lazily-loaded dependencies at dev-server
  // startup. These are imported only inside the AI worker
  // (`@huggingface/transformers`), a lazy main-thread runner
  // (`@mediapipe/tasks-vision` for face detection), or on first HEIC
  // open (`libheif-js`) — so Vite's dep optimizer doesn't discover them
  // until the user first triggers that path. When it discovers a new
  // dep mid-session it logs "optimized dependencies changed. reloading"
  // and force-reloads the tab; because the editor's chosen document
  // lives in in-memory React state, that reload silently bounced the
  // user back to the landing page the first time they downloaded ANY
  // model. Pre-including them here means they're optimized before the
  // app mounts, so the first model download no longer reloads the tab.
  optimizeDeps: {
    include: ["@huggingface/transformers", "@mediapipe/tasks-vision", "libheif-js"],
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "cloakimg-mark.svg",
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
          "A complete browser-based photo workbench for crop, retouch, redact, colour, composition, and local export.",
        theme_color: "#faf8f5",
        background_color: "#faf8f5",
        display: "standalone",
        orientation: "portrait",
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
          // Deterministic captures from the live app using the privacy-safe
          // generated demo image in scripts/generate-pwa-screenshots.mjs.
          {
            src: "screenshots/iPhone.png",
            sizes: "1290x2796",
            type: "image/png",
            form_factor: "narrow",
            label: "CloakIMG mobile editor with the searchable tool picker",
          },
          {
            src: "screenshots/iPad.png",
            sizes: "2732x2048",
            type: "image/png",
            form_factor: "wide",
            label: "CloakIMG tablet editor with a local image and Adjust controls",
          },
        ],
        // Register as a system-wide handler for common image types.
        // When the user picks "Open with CloakIMG" in the OS file
        // browser, the launchQueue API delivers the FileSystemFileHandle
        // to the app and we route it into the editor like any drag/drop.
        file_handlers: [
          {
            action: "/",
            accept: {
              "image/png": [".png"],
              "image/jpeg": [".jpg", ".jpeg"],
              "image/webp": [".webp"],
              "image/avif": [".avif"],
              "image/gif": [".gif"],
              "image/heic": [".heic", ".heif"],
            },
          },
        ],
        // Web Share Target (GET): the app shows up in OS share sheets
        // for URL/text shares. File-based POST sharing also needs a
        // service-worker handler — that requires migrating from
        // generateSW to injectManifest and is tracked as a follow-up.
        share_target: {
          action: "/",
          method: "GET",
          params: {
            title: "title",
            text: "text",
            url: "url",
          },
        },
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
        // Every shell asset and local webfont is precached. Without a
        // runtime route there is no consumer for navigation preload,
        // and Workbox 7.4 now validates that relationship strictly.
        navigationPreload: false,
      },
    }),
  ],
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    ignorePatterns: [
      "handoff-readonly/**",
      // Vendored skill bundles — third-party UI for Hallmark, mirrored
      // to both `.claude/` (Claude Code) and `.agents/` (Agent SDK).
      // The bundled `main.js` files trip catch-param + floating-
      // promise rules that we don't enforce on third-party code.
      ".claude/skills/**",
      ".agents/skills/**",
    ],
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    globals: false,
    pool: "forks",
    setupFiles: ["./src/test/setup.ts"],
  },
});
