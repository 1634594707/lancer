import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type VideoErrorCode =
  | "E_NOT_VIDEO"
  | "E_PROBE_MISSING"
  | "E_PROBE_FAIL"
  | "E_TIMEOUT"
  | "E_MODEL_CONFIG"
  | "E_MODEL_FAIL"
  | "E_MODEL_BAD_REF";
export class VideoPassError extends Error {
  constructor(readonly code: VideoErrorCode) {
    super(code);
  }
}
export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function readJson(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null;
  try {
    return record(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}
export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  renameSync(temp, file);
}
export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) {
    if (!Buffer.isBuffer(chunk)) throw new VideoPassError("E_PROBE_FAIL");
    hash.update(chunk);
  }
  return hash.digest("hex");
}
export interface CommandResult {
  stdout: string;
  stderr: string;
}
export function runCommand(
  bin: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let oversized = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    const collect = (chunk: Buffer, stream: "stdout" | "stderr") => {
      if (stream === "stdout") stdout += chunk.toString();
      else stderr += chunk.toString();
      if (stdout.length + stderr.length > 32 * 1024 * 1024) {
        oversized = true;
        child.kill("SIGKILL");
      }
    };
    child.stdout.on("data", (chunk: Buffer) => collect(chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => collect(chunk, "stderr"));
    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new VideoPassError(error.code === "ENOENT" ? "E_PROBE_MISSING" : "E_PROBE_FAIL"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new VideoPassError("E_TIMEOUT"));
      else if (code !== 0 || oversized) reject(new VideoPassError("E_PROBE_FAIL"));
      else resolve({ stdout, stderr });
    });
  });
}
export function errorCode(error: unknown): VideoErrorCode {
  return error instanceof VideoPassError ? error.code : "E_PROBE_FAIL";
}
