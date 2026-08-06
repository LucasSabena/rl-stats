import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./styles/globals.css";
import App from "./App";

async function bootstrap() {
  // Browser-only dev preview: when the frontend runs outside Tauri there is
  // no Rust core, so install a mock IPC backend that simulates a live match.
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    const { installMockBackend } = await import("@/dev/mockBackend");
    installMockBackend();
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
