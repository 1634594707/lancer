import { shell } from "electron";
import { desktopIpc } from "../../contracts/ipc";
import type {
  DoubaoAppBindInput,
  DoubaoAppEnabledInput,
  DoubaoAppOpenVideoInput,
  DoubaoAppSendInput,
} from "../../contracts/doubao-app";
import type { DoubaoAppService } from "../doubao-app/service";
import type { MainFrameHandler } from "./main-frame-ipc";
import {
  expectBoolean,
  expectNonEmptyString,
  expectRecord,
  expectSessionTarget,
} from "./request-validation";
export function expectDoubaoBind(raw: unknown): DoubaoAppBindInput {
  const v = expectRecord(raw, "doubaoBind");
  const target = expectSessionTarget(v.target);
  if (v.conversationId === undefined) return { target };
  const conversationId = expectNonEmptyString(v.conversationId, "conversationId");
  if (!/^\d{1,30}$/.test(conversationId)) throw new Error("Invalid conversationId");
  return { target, conversationId };
}
export function expectDoubaoSend(raw: unknown): DoubaoAppSendInput {
  const v = expectRecord(raw, "doubaoSend");
  const text = expectNonEmptyString(v.text, "text");
  if (Buffer.byteLength(text, "utf8") > 50_000) throw new Error("Message is too long");
  return {
    target: expectSessionTarget(v.target),
    text,
    ...(v.download === undefined ? {} : { download: expectBoolean(v.download, "download") }),
  };
}
function expectEnabled(raw: unknown): DoubaoAppEnabledInput {
  const v = expectRecord(raw, "doubaoEnabled");
  return { target: expectSessionTarget(v.target), enabled: expectBoolean(v.enabled, "enabled") };
}
function expectVideo(raw: unknown): DoubaoAppOpenVideoInput {
  const v = expectRecord(raw, "doubaoVideo");
  const videoId = expectNonEmptyString(v.videoId, "videoId");
  if (!/^[a-f0-9]{24}$/.test(videoId)) throw new Error("Invalid videoId");
  return { target: expectSessionTarget(v.target), videoId };
}
export function registerDoubaoAppRequests(
  handle: MainFrameHandler,
  service: DoubaoAppService,
): void {
  handle(desktopIpc.doubaoAppStatus, expectSessionTarget, (target) => service.status(target));
  handle(desktopIpc.doubaoAppBind, expectDoubaoBind, (input) => service.bind(input));
  handle(desktopIpc.doubaoAppSend, expectDoubaoSend, (input) => service.send(input));
  handle(desktopIpc.doubaoAppRefresh, expectSessionTarget, (target) => service.refresh(target));
  handle(desktopIpc.doubaoAppSelect, expectSessionTarget, (target) =>
    service.refresh(target, true),
  );
  handle(desktopIpc.doubaoAppSetEnabled, expectEnabled, (input) =>
    service.setEnabled(input.target, input.enabled),
  );
  handle(desktopIpc.doubaoAppOpenVideo, expectVideo, (input) =>
    service.openVideo(input.target, input.videoId),
  );
  handle(
    desktopIpc.doubaoAppOpenAccessibilitySettings,
    () => undefined,
    async () => {
      if (process.platform !== "darwin") throw new Error("E_UNSUPPORTED");
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      );
    },
  );
}
