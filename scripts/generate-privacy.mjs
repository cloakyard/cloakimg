import { createServer } from "vite-plus";
import { execFileSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import pkg from "../package.json" with { type: "json" };
import { mkdir, writeFile } from "node:fs/promises";
const server = await createServer({
  configFile: false,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { PrivacyPage } = await server.ssrLoadModule("/src/landing/PrivacyPage.tsx");
  const body = renderToStaticMarkup(createElement(PrivacyPage));
  await mkdir("privacy", { recursive: true });
  await writeFile(
    "privacy/index.html",
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="light dark"><link rel="icon" href="/icons/favicon.svg"><link rel="stylesheet" href="/src/styles/air.css"><link rel="stylesheet" href="/src/styles/air-entry.css"><title>Privacy policy · CloakIMG</title><meta name="description" content="How CloakIMG handles images, local storage and optional on-device models."></head><body><div id="app">${body}</div><script type="module" src="/src/privacy.tsx"></script></body></html>`,
  );
  execFileSync("vp", ["fmt", "privacy/index.html"]);
} finally {
  await server.close();
}
