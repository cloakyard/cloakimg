import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Cloakyard family typography is bundled locally so the full interface
// remains typographically stable offline and never needs a font CDN.
import "@fontsource/archivo/latin-400.css";
import "@fontsource/archivo/latin-500.css";
import "@fontsource/archivo/latin-600.css";
import "@fontsource/archivo/latin-700.css";
import "@fontsource/archivo/latin-800.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "./tokens.css";
import "./style.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

const root = document.getElementById("app");
if (!root) {
  throw new Error("CloakIMG: missing #app mount point in index.html");
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
