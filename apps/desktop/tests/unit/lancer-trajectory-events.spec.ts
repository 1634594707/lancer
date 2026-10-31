import { expect, test } from "@playwright/test";
import {
  TRAJECTORY_EVENTS,
  trajectoryEvent,
} from "../../src/features/conversation/session-trajectory/trajectory-events";
import {
  buildDefaultLanes,
  buildTrajectoryFromSessionTree,
  type TrajectoryNode,
} from "../../src/features/conversation/session-trajectory/trajectory-model";
import { lancerZoneById } from "../../contracts/lancer-zones";

const node: TrajectoryNode = {
  id: "fixture-node",
  parentId: null,
  kind: "message",
  title: "",
  timestamp: "",
  depth: 0,
  laneId: "lane:s",
  isActivePath: true,
  state: "neutral",
};

test("all sixteen legend types map to explicit fixture transcript events", () => {
  const titles = [
    "提交/保存 · notes.md",
    "交接 → Grok",
    "检查点 · 定稿",
    "测试 2 通过",
    "测试 2 失败",
    "审查通过",
    "分叉 · wt/refactor",
    "合并 · main",
    "产物 · keyframes",
    "工具调用 · read",
    "模型切换 · Opus",
    "上下文压缩",
    "等待你 · 标题确认",
    "跨线引用 · digest.md",
    "错误 · GPU 超时",
    "重试 #2",
  ];
  expect(titles.map((title) => trajectoryEvent({ ...node, title }))).toEqual(
    TRAJECTORY_EVENTS.map((event) => event.key),
  );
});

test("native compaction/fork/handoff take precedence; ordinary prose does not invent tests", () => {
  expect(trajectoryEvent({ ...node, kind: "compaction" })).toBe("compact");
  expect(trajectoryEvent({ ...node, isFork: true, eventType: "fork" })).toBe("fork");
  expect(trajectoryEvent({ ...node, isFork: true })).toBe("submit");
  expect(trajectoryEvent({ ...node, kind: "handoff" })).toBe("handoff");
  expect(trajectoryEvent({ ...node, title: "I'll run tests next" })).toBe("submit");
});

test("running test tools are not marked passed; non-test failures are errors", () => {
  const lane = {
    id: "lane:s",
    label: "Lancer",
    color: "#000",
    sessionId: "s",
    workspaceId: "w",
    isCurrent: true,
  };
  for (const [label, status, expected] of [
    ["pnpm test", "running", "tool"],
    ["pnpm test", "done", "test"],
    ["pnpm test", "error", "test-fail"],
    ["render video", "error", "error"],
  ] as const) {
    const result = buildTrajectoryFromSessionTree({ roots: [], leafId: null }, lane, [
      {
        kind: "tool",
        id: "call",
        callId: "call",
        createdAt: "",
        toolName: "bash",
        label,
        status,
        input: {},
      },
    ]);
    expect(result.nodes[0]?.eventType).toBe(expected);
  }
});

test("relay plans are zone configuration, with actual sibling workspaces retained", () => {
  // The media pipeline must not claim preset chat models executed local tools.
  expect(lancerZoneById("video").relay).toEqual([]);
  expect(lancerZoneById("research").relay.map((model) => model.label)).not.toEqual(
    lancerZoneById("video").relay.map((model) => model.label),
  );
  const lanes = buildDefaultLanes({
    workspaceId: "w1",
    sessionId: "s1",
    sessionTitle: "lancer-zone:lancer|Lancer",
    siblingSessionIds: [{ workspaceId: "w2", sessionId: "s2", title: "lancer-zone:video|Video" }],
  });
  expect(lanes.find((lane) => lane.sessionId === "s2")?.workspaceId).toBe("w2");
});
