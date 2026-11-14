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
  const { RecoveryPage } = await server.ssrLoadModule("/src/landing/RecoveryPage.tsx");
  await mkdir("privacy", { recursive: true });
  for (const [path, Page, title, metadata] of [
    [
      "privacy/index.html",
      PrivacyPage,
      "Privacy policy · CloakIMG",
      '<meta name="description" content="How CloakIMG handles images, local storage and optional on-device models.">',
    ],
    [
      "404.html",
      RecoveryPage,
      "Page not found · CloakIMG",
      '<meta name="robots" content="noindex">',
    ],
  ]) {
    const body = renderToStaticMarkup(createElement(Page));
    await writeFile(
      path,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#fafbfc" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#101216" media="(prefers-color-scheme: dark)"><link rel="icon" href="/icons/favicon.svg"><link rel="stylesheet" href="/src/styles/air.css"><link rel="stylesheet" href="/src/styles/air-entry.css"><title>${title}</title>${metadata}</head><body><div id="app">${body}</div><script type="module" src="/src/static-pages.ts"></script></body></html>`,
    );
    execFileSync("vp", ["fmt", path]);
  }
} finally {
  await server.close();
}
