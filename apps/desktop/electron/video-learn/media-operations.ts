import { realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { VideoLearnOperation } from "../../contracts/video-learn";
import { readJson, runCommand, writeJson } from "./io";

export type MediaOperationListener = (operation: VideoLearnOperation) => void;
const quote = (value: string) =>
  /^[\w./:%=-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;

/** Display quoting only. Execution remains spawn(bin, args), never a shell. */
export async function runMediaOperation(
  id: string,
  label: string,
  bin: string,
  args: string[],
  timeout: number,
  notify?: MediaOperationListener,
) {
  const operation = { id, label, command: [bin, ...args].map(quote).join(" ") };
  const start = performance.now();
  notify?.({ ...operation, status: "running" });
  try {
    const result = await runCommand(bin, args, timeout);
    const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
    notify?.({
      ...operation,
      status: "success",
      durationMs: Math.round(performance.now() - start),
      output:
        output.length > 6000
          ? `${output.slice(0, 1800)}\n… 输出已截取 …\n${output.slice(-4000)}`
          : output,
    });
    return result;
  } catch (error) {
    notify?.({
      ...operation,
      status: "error",
      durationMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message.slice(0, 500) : "媒体命令未完成",
    });
    throw error;
  }
}

export function recordMediaOperations(root: string, id: string): MediaOperationListener {
  const operations = new Map<string, VideoLearnOperation>();
  return (operation) => {
    operations.set(operation.id, operation);
    writeJson(path.join(root, "learning", id, "media-operations.json"), {
      videoId: id,
      operations: [...operations.values()],
    });
  };
}

export function readMediaOperations(root: string, id: string): readonly VideoLearnOperation[] {
  try {
    const base = realpathSync(root);
    const file = realpathSync(path.join(base, "learning", id, "media-operations.json"));
    const relative = path.relative(base, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || statSync(file).size > 64_000)
      return [];
    const data = readJson(file);
    if (data?.videoId !== id || !Array.isArray(data.operations)) return [];
    return data.operations.slice(0, 3).flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object") return [];
      const op = entry as Record<string, unknown>;
      if (
        typeof op.id !== "string" ||
        typeof op.label !== "string" ||
        typeof op.command !== "string" ||
        !["running", "success", "error"].includes(String(op.status))
      )
        return [];
      return [
        {
          id: op.id.slice(0, 80),
          label: op.label.slice(0, 120),
          command: op.command.slice(0, 8000),
          status: op.status as VideoLearnOperation["status"],
          ...(typeof op.output === "string" ? { output: op.output.slice(0, 6000) } : {}),
          ...(typeof op.error === "string" ? { error: op.error.slice(0, 500) } : {}),
          ...(typeof op.durationMs === "number" &&
          Number.isFinite(op.durationMs) &&
          op.durationMs >= 0
            ? { durationMs: op.durationMs }
            : {}),
        },
      ];
    });
  } catch {
    return [];
  }
}
