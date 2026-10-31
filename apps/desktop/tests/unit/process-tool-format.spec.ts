import { expect, test } from "@playwright/test";
import {
  buildProcessToolExcerpt,
  buildProcessToolSummary,
} from "../../src/features/conversation/process-timeline/process-tool-format";
import type { TimelineToolCall } from "../../contracts/timeline-types";

function tool(
  partial: Partial<TimelineToolCall> & Pick<TimelineToolCall, "toolName">,
): TimelineToolCall {
  return {
    kind: "tool",
    id: "t1",
    callId: "c1",
    status: "success",
    label: partial.label ?? partial.toolName,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("buildProcessToolSummary formats read, edit, and bash", () => {
  expect(
    buildProcessToolSummary(
      tool({
        toolName: "read",
        input: { path: "/ws/README.md", offset: 1, limit: 24 },
      }),
    ),
  ).toBe("Read README.md · lines 1–24");

  expect(
    buildProcessToolSummary(
      tool({
        toolName: "edit",
        input: {
          path: "src/ui.ts",
          old_string: "laneCount = 1",
          new_string: "laneCount = 2",
        },
      }),
    ),
  ).toBe("Edit src/ui.ts · laneCount = 1 → laneCount = 2");

  expect(
    buildProcessToolSummary(
      tool({
        toolName: "bash",
        input: { command: "pnpm typecheck" },
        output: { content: [{ type: "text", text: "ok\n" }] },
      }),
    ),
  ).toContain("bash · pnpm typecheck · Succeeded");
});

test("buildProcessToolExcerpt returns short output lines", () => {
  const excerpt = buildProcessToolExcerpt(
    tool({
      toolName: "read",
      output: { content: [{ type: "text", text: "# Title\nline2\nline3\n" }] },
    }),
  );
  expect(excerpt).toContain("# Title");
  expect(excerpt.split("\n").length).toBeLessThanOrEqual(6);
});

test("bash summaries preserve failure evidence without guessing exit codes from output", () => {
  const summary = (status: TimelineToolCall["status"], output: unknown) =>
    buildProcessToolSummary(tool({ toolName: "bash", status, output }));
  expect(
    summary("error", {
      content: [{ type: "text", text: "=== perf docs ===\n\nCommand exited with code 1" }],
    }),
  ).toBe("bash · exit 1");
  expect(summary("success", "0 errors; failed count: 0")).toBe("bash · Succeeded");
  expect(summary("error", "partial output")).toBe("bash · Failed");
  expect(summary("success", "")).toBe("bash · Succeeded");
  expect(summary("running", { details: { exitCode: 0 } })).toBe("bash · In progress");
  expect(summary("error", { details: { exitCode: 2 } })).toBe("bash · exit 2");
  expect(summary("success", { exitCode: 0 })).toBe("bash · exit 0");
});
