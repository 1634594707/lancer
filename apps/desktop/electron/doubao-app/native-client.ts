import { spawn } from "node:child_process";
import type { DoubaoAppMessage } from "../../contracts/doubao-app";

export interface NativeDoubaoRequest {
  readonly action: "snapshot" | "select" | "send" | "inspectVideo";
  readonly conversationId?: string;
  readonly text?: string;
  readonly path?: string;
}
export interface NativeDoubaoSnapshot {
  readonly ok: boolean;
  readonly permission: boolean;
  readonly conversationId: string | null;
  readonly title: string;
  readonly messages: readonly DoubaoAppMessage[];
  readonly busy: boolean;
  readonly transcriptVersion?: 2 | 3;
  readonly error?: string;
  readonly sent?: boolean;
  readonly durationMs?: number;
  readonly hasVideo?: boolean;
  readonly hasAudio?: boolean;
}
export type NativeDoubaoCall = (request: NativeDoubaoRequest) => Promise<NativeDoubaoSnapshot>;
export function decodeNativeSnapshot(value: unknown): NativeDoubaoSnapshot {
  if (!value || typeof value !== "object") throw new Error("E_NATIVE_RESPONSE");
  const v = value as Record<string, unknown>;
  if (
    typeof v.ok !== "boolean" ||
    typeof v.permission !== "boolean" ||
    typeof v.busy !== "boolean" ||
    typeof v.title !== "string" ||
    !(
      v.conversationId === undefined ||
      v.conversationId === null ||
      (typeof v.conversationId === "string" && /^\d{1,30}$/.test(v.conversationId))
    ) ||
    !Array.isArray(v.messages) ||
    v.messages.length > 2000
  )
    throw new Error("E_NATIVE_RESPONSE");
  const messages = v.messages.map((message): DoubaoAppMessage => {
    if (!message || typeof message !== "object") throw new Error("E_NATIVE_RESPONSE");
    const m = message as Record<string, unknown>;
    if (
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.text !== "string" ||
      m.text.length > 1_000_000
    )
      throw new Error("E_NATIVE_RESPONSE");
    return { role: m.role, text: m.text };
  });
  return {
    ok: v.ok,
    permission: v.permission,
    conversationId: typeof v.conversationId === "string" ? v.conversationId : null,
    title: v.title,
    messages,
    busy: v.busy,
    ...(v.transcriptVersion === 2 || v.transcriptVersion === 3
      ? { transcriptVersion: v.transcriptVersion }
      : {}),
    ...(typeof v.error === "string" ? { error: v.error } : {}),
    ...(typeof v.sent === "boolean" ? { sent: v.sent } : {}),
    ...(typeof v.durationMs === "number" && Number.isFinite(v.durationMs)
      ? { durationMs: v.durationMs }
      : {}),
    ...(typeof v.hasVideo === "boolean" ? { hasVideo: v.hasVideo } : {}),
    ...(typeof v.hasAudio === "boolean" ? { hasAudio: v.hasAudio } : {}),
  };
}
export function nativeDoubaoClient(binaryPath: string): NativeDoubaoCall {
  return (request) =>
    new Promise((resolve, reject) => {
      const child = spawn(binaryPath, [], { stdio: ["pipe", "pipe", "pipe"] });
      let output = "";
      let finished = false;
      const finish = (error?: Error, result?: NativeDoubaoSnapshot) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (error) reject(error);
        else if (result) resolve(result);
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error(request.action === "send" ? "E_SEND_UNCONFIRMED" : "E_NATIVE_TIMEOUT"));
      }, 20_000);
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
        if (output.length > 4_000_000) {
          child.kill("SIGKILL");
          finish(new Error("E_NATIVE_RESPONSE"));
        }
      });
      child.stderr.resume();
      child.stdin.on("error", () => finish(new Error("E_NATIVE_UNAVAILABLE")));
      child.once("error", () => finish(new Error("E_NATIVE_UNAVAILABLE")));
      child.once("close", () => {
        try {
          finish(undefined, decodeNativeSnapshot(JSON.parse(output) as unknown));
        } catch {
          finish(new Error(request.action === "send" ? "E_SEND_UNCONFIRMED" : "E_NATIVE_RESPONSE"));
        }
      });
      child.stdin.end(JSON.stringify(request));
    });
}
