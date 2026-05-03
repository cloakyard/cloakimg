import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Bundled font fallback so the editor renders Inter / Instrument Serif
// even when offline — the Google Fonts <link> in index.html stays as the
// fast cached path on first load.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./tokens.css";
import "./style.css";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";

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
