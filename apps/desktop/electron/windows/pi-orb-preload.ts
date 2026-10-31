import { contextBridge, ipcRenderer } from "electron";

const invoke = (channel: string, payload?: unknown) => {
  void ipcRenderer
    .invoke(channel, payload)
    .catch((error: unknown) => console.error("Orb action failed", error));
};
contextBridge.exposeInMainWorld("piOrb", {
  expand: () => invoke("pi-orb:expand"),
  collapse: () => invoke("pi-orb:collapse"),
  open: (workspaceId: string, sessionId: string) =>
    invoke("pi-orb:open", { workspaceId, sessionId }),
  onLanes: (callback: (lanes: unknown) => void) =>
    ipcRenderer.on("pi-orb:lanes", (_event, lanes: unknown) => callback(lanes)),
});
