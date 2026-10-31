import { expect, test } from "@playwright/test";
import {
  buildProcessBlocks,
  processViewportRows,
} from "../../src/features/conversation/process-timeline/build-process-blocks";
import type { DisplayTimelineItem } from "../../contracts/timeline-types";

test("buildProcessBlocks groups tools between assistant messages into a stage", () => {
  const rows: DisplayTimelineItem[] = [
    {
      kind: "message",
      id: "u1",
      role: "user",
      text: "hi",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      kind: "message",
      id: "a1",
      role: "assistant",
      text: "ok",
      createdAt: "2026-01-01T00:00:01.000Z",
    },
    {
      kind: "tool",
      id: "t1",
      callId: "c1",
      toolName: "read",
      status: "success",
      label: "Read foo.ts",
      createdAt: "2026-01-01T00:00:02.000Z",
    },
    {
      kind: "tool",
      id: "t2",
      callId: "c2",
      toolName: "bash",
      status: "success",
      label: "Ran tests",
      createdAt: "2026-01-01T00:00:03.000Z",
    },
  ];
  const blocks = buildProcessBlocks(rows);
  expect(blocks.map((block) => block.kind)).toEqual(["user", "assistant-prose", "stage"]);
  const stage = blocks[2];
  expect(stage?.kind === "stage" && stage.steps.length).toBe(2);
  expect(processViewportRows(blocks).map((row) => row.id)).toEqual(["u1", "a1", "t1"]);
});

test("handoff prose becomes one visible block, without an invisible duplicate measured row", () => {
  const blocks = buildProcessBlocks([
    {
      kind: "message",
      id: "a1",
      role: "assistant",
      text: "Handoff · GPT-5 → Grok Bot\nContext intact",
      createdAt: "",
    },
  ]);
  expect(blocks).toEqual([
    {
      kind: "handoff",
      id: "handoff:a1",
      fromLabel: "GPT-5",
      toLabel: "Grok Bot",
      detail: "Context intact",
    },
  ]);
  expect(processViewportRows(blocks).map((row) => row.id)).toEqual(["handoff:a1"]);
});
