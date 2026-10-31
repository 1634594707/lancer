import { t } from "../../../../contracts/i18n";
import type { TimelineToolCall } from "../../../../contracts/timeline-types";
import { extractDiffFromOutput } from "../../../ui/diff-inline";

const WRITE_TOOL = /write|edit|patch|apply/i;
const READ_TOOL = /read|view|cat|open|file/i;
const BASH_TOOL = /bash|shell|exec|terminal|command|run/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function toolPathFromInput(input: unknown): string {
  if (!isRecord(input)) return "";
  const path = input.file_path ?? input.filePath ?? input.path ?? input.filename;
  return typeof path === "string" ? path : "";
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function shortenPath(filePath: string, maxSegments = 3): string {
  const parts = filePath.split("/");
  if (parts.length <= maxSegments) return filePath;
  return parts.slice(-maxSegments).join("/");
}

function textFromOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (!isRecord(output)) return "";
  if (typeof output.text === "string") return output.text;
  if (Array.isArray(output.content)) {
    return output.content
      .map((part) => {
        if (!isRecord(part)) return "";
        if (part.type === "text" && typeof part.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function readLineRange(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  const offset = input.offset ?? input.start_line ?? input.startLine;
  const limit = input.limit ?? input.end_line ?? input.endLine;
  if (typeof offset === "number" && typeof limit === "number") {
    const end = offset + limit - 1;
    return `lines ${offset}–${end}`;
  }
  if (typeof offset === "number" && typeof limit !== "number") {
    return `from line ${offset}`;
  }
  return undefined;
}

function editChangeHint(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  const oldStr = input.old_string ?? input.oldString;
  const newStr = input.new_string ?? input.newString;
  if (typeof oldStr === "string" && typeof newStr === "string") {
    const oldOne = oldStr.replace(/\s+/g, " ").trim();
    const newOne = newStr.replace(/\s+/g, " ").trim();
    if (oldOne.length > 0 && newOne.length > 0 && oldOne.length < 48 && newOne.length < 48) {
      return `${oldOne} → ${newOne}`;
    }
    if (oldOne.length > 0 && newOne.length > 0) {
      return `${oldOne.slice(0, 20)}… → ${newOne.slice(0, 20)}…`;
    }
  }
  return undefined;
}

function bashCommand(input: unknown): string {
  if (!isRecord(input)) return "";
  const cmd = input.command ?? input.cmd ?? input.script;
  if (typeof cmd !== "string") return "";
  const oneLine = cmd.replace(/\s+/g, " ").trim();
  return oneLine.length > 72 ? `${oneLine.slice(0, 69)}…` : oneLine;
}

/** Preserve the executed command; the row summary is deliberately abbreviated. */
export function processToolCommand(item: TimelineToolCall): string {
  if (!BASH_TOOL.test(item.toolName) || !isRecord(item.input)) return "";
  const command = item.input.command ?? item.input.cmd ?? item.input.script;
  return typeof command === "string" ? command : "";
}

function bashExitHint(item: TimelineToolCall): string {
  if (item.status === "running") return t("process.stage.running");
  const output = item.output;
  const details = isRecord(output) && isRecord(output.details) ? output.details : output;
  const code = isRecord(details) ? (details.exitCode ?? details.exit_code) : undefined;
  if (typeof code === "number" && Number.isInteger(code)) return `exit ${code}`;
  // Pi bash appends this trailer for nonzero exits. Ordinary command output is
  // not evidence of success or failure (e.g. a search for the word "error").
  const match = textFromOutput(output).match(/(?:^|\n)Command exited with code (-?\d+)\s*$/);
  if (item.status === "error" && match) return `exit ${match[1]}`;
  return t(item.status === "error" ? "process.step.failed" : "process.step.succeeded");
}

/** One-line summary for process step rows (prototype-style). */
export function buildProcessToolSummary(item: TimelineToolCall): string {
  const name = item.toolName.toLowerCase();
  const path = toolPathFromInput(item.input);

  if (WRITE_TOOL.test(name)) {
    const file = path ? shortenPath(path) : "";
    const change = editChangeHint(item.input);
    if (file && change) return `Edit ${file} · ${change}`;
    if (file) return `Edit ${file}`;
  }

  if (READ_TOOL.test(name) && path) {
    const range = readLineRange(item.input);
    const file = basename(path);
    return range ? `Read ${file} · ${range}` : `Read ${file}`;
  }

  if (BASH_TOOL.test(name)) {
    const cmd = bashCommand(item.input);
    const exit = bashExitHint(item);
    const parts = ["bash", cmd, exit].filter((part) => part && part.length > 0);
    return parts.join(" · ");
  }

  return item.label;
}

function compactDiffLines(input: unknown, output: unknown): string[] {
  const diff = extractDiffFromOutput(output);
  if (diff) {
    return diff
      .split("\n")
      .filter((line) => line.startsWith("+") || line.startsWith("-"))
      .filter((line) => !line.startsWith("+++") && !line.startsWith("---"))
      .slice(0, 8);
  }
  if (!isRecord(input)) return [];
  const oldStr = input.old_string ?? input.oldString;
  const newStr = input.new_string ?? input.newString;
  const lines: string[] = [];
  if (typeof oldStr === "string") {
    for (const line of oldStr.split("\n").slice(0, 4)) {
      if (line.trim()) lines.push(`- ${line}`);
    }
  }
  if (typeof newStr === "string") {
    for (const line of newStr.split("\n").slice(0, 4)) {
      if (line.trim()) lines.push(`+ ${line}`);
    }
  }
  return lines.slice(0, 8);
}

/** Short excerpt (a few lines) shown under the summary; not full JSON. */
export function buildProcessToolExcerpt(item: TimelineToolCall): string {
  const name = item.toolName.toLowerCase();

  if (WRITE_TOOL.test(name)) {
    const diffLines = compactDiffLines(item.input, item.output);
    if (diffLines.length > 0) return diffLines.join("\n");
  }

  const text = textFromOutput(item.output);
  if (text.trim()) {
    return text.split("\n").slice(0, 6).join("\n").trim();
  }

  if (typeof item.detail === "string" && item.detail.trim()) {
    return item.detail.trim().split("\n").slice(0, 6).join("\n");
  }

  return "";
}

export function formatToolRawJson(item: TimelineToolCall): string {
  const parts: string[] = [];
  if (item.input !== undefined) {
    parts.push(typeof item.input === "string" ? item.input : JSON.stringify(item.input, null, 2));
  }
  if (item.output !== undefined) {
    parts.push(
      typeof item.output === "string" ? item.output : JSON.stringify(item.output, null, 2),
    );
  }
  return parts.join("\n\n");
}
