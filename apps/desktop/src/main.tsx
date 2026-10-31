import React from "react";
import ReactDOM from "react-dom/client";
import { earlyModifierChords, getSidePanelTabCommand } from "../contracts/ipc";
import App from "./app/App";
import { LancerReplaySurface } from "./features/conversation/lancer-process/replay-surface";
import { RendererErrorBoundary } from "./app/desktop-recovery";
import { applyInitialLocale, LocaleRoot } from "./app/locale-root";
import { applyLastTheme } from "./ui/active-theme";
import "./dev-reload-hook";
import "./styles.css";

window.addEventListener(
  "keydown",
  (event) => {
    // Control+digit on macOS selects a side panel tab, not a thread; main queues it.
    const platform = window.piApp?.platform ?? "linux";
    const chord = {
      meta: event.metaKey,
      control: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      key: event.key,
      code: event.code,
    };
    if (getSidePanelTabCommand(platform, chord)) return;
    earlyModifierChords.note({
      modifier: event.metaKey || event.ctrlKey,
      shift: event.shiftKey,
      key: event.key,
      code: event.code,
    });
  },
  true,
);

applyLastTheme();
applyInitialLocale();
document.documentElement.dataset.platform = window.piApp?.platform ?? "linux";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RendererErrorBoundary
      onRelaunch={() => {
        window.piApp?.relaunchApplication()?.catch((error: unknown) => {
          console.error("[renderer] relaunchApplication failed", error);
        });
      }}
    >
      <LocaleRoot>
        {new URLSearchParams(location.search).get("lancer-replay") === "r8" ? (
          <LancerReplaySurface />
        ) : (
          <App />
        )}
      </LocaleRoot>
    </RendererErrorBoundary>
  </React.StrictMode>,
);
