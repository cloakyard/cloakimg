import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defaultClientConditions, defineConfig } from "vite-plus";
import pkg from "./package.json" with { type: "json" };

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  base: process.env.VITE_APP_BASE_PATH || "/",
  resolve: {
    // Transformers.js already loads version-matched ORT WASM from its CDN.
    // Select ORT's supported external-WASM entry so Vite does not also emit
    // its 25.6 MiB fallback binary (Workers assets are limited to 25 MiB).
    // Keep Vite's defaults for all other conditional package exports.
    conditions: ["onnxruntime-web-use-extern-wasm", ...defaultClientConditions],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: { rollupOptions: { input: { main: "index.html", privacy: "privacy/index.html" } } },
  server: {
    allowedHosts: true,
  },
  // Discover lazy model/codec dependencies before an editing session starts.
  // A new dependency optimized mid-session reloads the page and loses its image.
  optimizeDeps: {
    include: [
      "@huggingface/transformers",
      "@mediapipe/tasks-vision",
      "@jsquash/avif/encode.js",
      "@base-ui/react/menu",
    ],
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
          "A private photo editor. Edit, compose and export on your device, including exact passport and visa photo sheets.",
        theme_color: "#fafbfc",
        background_color: "#fafbfc",
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
          // Actual editor captures using the local landing photograph.
          {
            src: "screenshots/iPhone.png",
            sizes: "1290x2796",
            type: "image/png",
            form_factor: "narrow",
            label: "CloakIMG phone editor with focused Adjust controls and a persistent tool dock",
          },
          {
            src: "screenshots/iPad.png",
            sizes: "2048x1536",
            type: "image/png",
            form_factor: "wide",
            label: "CloakIMG tablet editor with a compact rail and Adjust inspector",
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
              "image/heic": [".heic"],
              "image/heif": [".heif"],
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
        globIgnores: [
          // Modern export codecs are lazy by design. The HEIC WASM is
          // emitted as its own lazy chunk; pre-caching either chunk would
          // make every first visit pay for codecs most users never use.
          "**/exportCodec.worker-*.js",
          "**/heif-codec-*.js",
          "**/avif_enc_mt.worker-*.js",
        ],
        runtimeCaching: [
          {
            // Cache modern export codecs after first use. This preserves a
            // small initial PWA install while keeping AVIF/HEIC export
            // available offline once the user has loaded that local codec.
            urlPattern:
              /\/assets\/(?:exportCodec\.worker|heif-codec|avif_enc(?:_mt)?(?:\.worker)?)-[^/]+\.(?:js|wasm)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "cloakimg-modern-image-codecs",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 8, maxAgeSeconds: 31_536_000 },
            },
          },
        ],
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
  fmt: {
    ignorePatterns: [
      "src/editor/vendor/heif-codec.js",
      ".agents/**",
      ".claude/skills/**",
      "docs/air/assets/**",
    ],
  },
  lint: {
    ignorePatterns: [
      "docs/air/assets/**",
      "handoff-readonly/**",
      // Vendored skill bundles — third-party UI for Hallmark, mirrored
      // to both `.claude/` (Claude Code) and `.agents/` (Agent SDK).
      // The bundled `main.js` files trip catch-param + floating-
      // promise rules that we don't enforce on third-party code.
      ".claude/skills/**",
      ".agents/skills/**",
      // Generated from the pinned, reviewable C++ sources under
      // vendor/heif-codec; lint the source and wrapper, not Emscripten output.
      "src/editor/vendor/heif-codec.js",
    ],
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    globals: false,
    pool: "forks",
    setupFiles: ["./src/test/setup.ts"],
  },
});
