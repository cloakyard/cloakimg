import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
