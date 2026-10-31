import { app, BrowserWindow, screen } from "electron";
import { mainFrameHandler } from "../ipc/main-frame-ipc";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DesktopAppStore } from "../application/app-store";
import type { ControlService } from "../control/control-service";
import type { SessionRef } from "@lancer/session-driver";
import { conversationRoot } from "../../contracts/lancer-assistants";
import { orbOutput } from "../control/orb-output";
import { stripLancerZonePrefix } from "../../contracts/lancer-zones";

/** A separate, sandboxed surface. It reads the in-process journal, never the control socket. */
export function createPiOrbWindow(
  store: DesktopAppStore,
  control: ControlService,
  open: (ref: SessionRef) => Promise<void>,
): BrowserWindow {
  const positionsPath = path.join(app.getPath("userData"), "pi-orb-positions.json");
  let positions: Record<string, { x: number; y: number }> = {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(positionsPath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      positions = parsed as typeof positions;
    }
  } catch {
    /* first launch */
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const saved = positions[String(display.id)];
  const area = display.workArea;
  const x =
    saved && Number.isFinite(saved.x)
      ? Math.max(area.x, Math.min(saved.x, area.x + area.width - 80))
      : area.x + area.width - 96;
  const y =
    saved && Number.isFinite(saved.y)
      ? Math.max(area.y, Math.min(saved.y, area.y + area.height - 80))
      : area.y + 80;
  const window = new BrowserWindow({
    x,
    y,
    width: 80,
    height: 80,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "pi-orb-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.setAlwaysOnTop(true, "floating");
  let expanded = false;
  let anchor = { x, y };
  let panelOffset = { x: 0, y: 0 };
  function resize(value: boolean) {
    if (expanded === value || window.isDestroyed()) return;
    expanded = value;
    const bounds = window.getBounds();
    const work = screen.getDisplayMatching(bounds).workArea;
    if (value) {
      anchor = { x: bounds.x, y: bounds.y };
      const panelX = Math.max(work.x, Math.min(bounds.x - 660, work.x + work.width - 740));
      const panelY = Math.max(work.y, Math.min(bounds.y, work.y + work.height - 460));
      panelOffset = { x: anchor.x - panelX, y: anchor.y - panelY };
      window.setBounds({ x: panelX, y: panelY, width: 740, height: 460 });
    } else {
      window.setBounds({ x: anchor.x, y: anchor.y, width: 80, height: 80 });
    }
  }
  function publish() {
    if (window.isDestroyed() || window.webContents.isLoading()) return;
    const state = store.snapshot();
    const lanes = state.workspaces.flatMap((workspace) =>
      workspace.sessions
        .filter((session) => !session.archivedAt)
        .map((session) => {
          const ref = { workspaceId: workspace.id, sessionId: session.id };
          const observed = control.journal.state(ref);
          return {
            ...ref,
            root: conversationRoot(ref, state.orchestrationChildren),
            selected:
              state.selectedWorkspaceId === ref.workspaceId &&
              state.selectedSessionId === ref.sessionId,
            title: stripLancerZonePrefix(session.title),
            model: session.config?.modelId ?? "pi",
            status:
              observed?.status === "waiting"
                ? "waiting"
                : session.status === "running" || session.status === "failed"
                  ? session.status
                  : (observed?.status ?? session.status),
            // The collapsed orb only needs status. Avoid cloning and projecting full
            // journals on every token while its CLI panel is invisible.
            output: expanded ? orbOutput(control.journal.logs(ref)) : "",
            stopped: state.orchestrationChildren.some(
              (child) =>
                child.childWorkspaceId === ref.workspaceId &&
                child.childSessionId === ref.sessionId &&
                child.supervisionLoop?.gate === "stop",
            ),
          };
        }),
    );
    window.webContents.send("pi-orb:lanes", lanes);
  }
  let publishTimer: ReturnType<typeof setTimeout> | undefined;
  const schedulePublish = () => {
    publishTimer ??= setTimeout(() => {
      publishTimer = undefined;
      publish();
    }, 100);
  };
  const stopStore = store.subscribe(schedulePublish);
  const stopJournal = control.journal.subscribe(schedulePublish);
  const handle = mainFrameHandler({
    windowForSender(sender) {
      if (window.isDestroyed() || sender !== window.webContents)
        throw new Error("Unknown orb window");
      return window;
    },
  });
  const removeExpand = handle(
    "pi-orb:expand",
    () => undefined,
    () => {
      resize(true);
      publish();
      if (process.platform === "darwin") app.focus({ steal: true });
      window.focus();
    },
  );
  const removeCollapse = handle(
    "pi-orb:collapse",
    () => undefined,
    () => resize(false),
  );
  const decodeTarget = (raw: unknown): SessionRef => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid conversation");
    const ref = raw as Partial<SessionRef>;
    if (typeof ref.workspaceId !== "string" || typeof ref.sessionId !== "string")
      throw new Error("Invalid conversation");
    return { workspaceId: ref.workspaceId, sessionId: ref.sessionId };
  };
  const removeOpen = handle("pi-orb:open", decodeTarget, (ref) => {
    if (
      !store
        .snapshot()
        .workspaces.some(
          (workspace) =>
            workspace.id === ref.workspaceId &&
            workspace.sessions.some((session) => session.id === ref.sessionId),
        )
    )
      return;
    void open({ workspaceId: ref.workspaceId, sessionId: ref.sessionId }).catch((error: unknown) =>
      console.error("[pi-orb] open failed", error),
    );
  });
  window.on("moved", () => {
    const bounds = window.getBounds();
    if (expanded) {
      anchor = { x: bounds.x + panelOffset.x, y: bounds.y + panelOffset.y };
      return;
    }
    anchor = { x: bounds.x, y: bounds.y };
    positions[String(screen.getDisplayMatching(bounds).id)] = anchor;
    try {
      writeFileSync(positionsPath, JSON.stringify(positions));
    } catch (error) {
      console.error("[pi-orb] position save failed", error);
    }
  });
  window.on("closed", () => {
    if (publishTimer) clearTimeout(publishTimer);
    stopStore();
    stopJournal();
    removeExpand();
    removeCollapse();
    removeOpen();
  });
  window.webContents.on("did-finish-load", publish);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.showInactive());
  const load = process.env.ELECTRON_RENDERER_URL
    ? window.loadURL(new URL("pi-orb.html", process.env.ELECTRON_RENDERER_URL).toString())
    : window.loadFile(path.join(__dirname, "..", "renderer", "pi-orb.html"));
  void load.catch((error: unknown) => console.error("[pi-orb] load failed", error));
  return window;
}
