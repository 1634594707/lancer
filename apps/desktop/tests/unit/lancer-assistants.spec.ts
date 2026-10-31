import {
  FLIGHT_SECONDS,
  LANDING_SECONDS,
} from "../../src/features/conversation/lancer-process/process-math";
import { expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LancerAssistantStore } from "../../electron/application/lancer-assistant-store";
import { assistantOwner, decodeLancerAction } from "../../contracts/lancer-assistants";
import { orbOutput } from "../../electron/control/orb-output";
import { RuntimeJournal } from "../../electron/control/runtime-journal";
import { LiveEmissionClock } from "../../src/features/conversation/lancer-process/live-emissions";
import { REPLAY_FIXTURE } from "../../src/features/conversation/lancer-process/replay-fixture";
import { branchReturnEvidence } from "../../electron/orchestration/branch-return";
import type { OrchestrationChildThread } from "../../contracts/desktop-state";
import { parallelTreeEvents } from "../../src/features/conversation/lancer-process/parallel-tree";
import { conversationRoot } from "../../contracts/lancer-assistants";

test("assistant edits and transfers survive restart without changing conversation identities", async () => {
  const file = await mkdtemp(join(tmpdir(), "lancer-assistants-"));
  const store = new LancerAssistantStore(file);
  await store.load();
  const target = { workspaceId: "workspace", sessionId: "keep-this-history" };
  await Promise.all([
    store.change({ kind: "assign", target, assistantId: "research" }),
    store.change({ kind: "save-assistant", id: "research", name: "我的研究员", avatar: "a2" }),
  ]);
  const restarted = new LancerAssistantStore(file);
  expect((await restarted.load()).profiles.find((p) => p.id === "research")).toMatchObject({
    name: "我的研究员",
    avatar: "a2",
  });
  await restarted.change({ kind: "delete-assistant", id: "research", transferTo: "creative" });
  const after = await new LancerAssistantStore(file).load();
  expect(assistantOwner(after, target)).toBe("creative");
  expect(Object.keys(after.owners)).toEqual(["workspace:keep-this-history"]);
  expect(() =>
    decodeLancerAction({
      kind: "save-assistant",
      name: "A",
      avatar: "https://example.com/tracker.svg",
    }),
  ).toThrow();
});

test("real-time CLI projection retains all lines and replaces cumulative tool updates", () => {
  const journal = new RuntimeJournal();
  const sessionRef = { workspaceId: "w", sessionId: "s" },
    timestamp = new Date().toISOString();
  const base = { sessionRef, timestamp, runId: "r" };
  journal.observe({
    ...base,
    type: "toolStarted",
    callId: "bash-1",
    toolName: "bash",
    input: { command: "probe" },
  });
  journal.observe({ ...base, type: "toolUpdated", callId: "bash-1", text: "one\ntwo" });
  journal.observe({ ...base, type: "toolUpdated", callId: "bash-1", text: "one\ntwo\nthree" });
  journal.observe({
    ...base,
    type: "toolFinished",
    callId: "bash-1",
    success: true,
    output: { text: "one\ntwo\nthree\nfour", exitCode: 0 },
  });
  journal.observe({ ...base, type: "assistantDelta", text: "Finished " });
  journal.observe({ ...base, type: "assistantDelta", text: "correctly" });
  expect(orbOutput(journal.logs(sessionRef))).toBe(
    '$ bash {"command":"probe"}\n\none\ntwo\nthree\nfour\n[exit 0]\n\nFinished correctly',
  );
});

test("saved history never fires and new deliveries retain independent trajectory seeds", () => {
  let random = 0;
  const clock = new LiveEmissionClock(() => (random += 0.2));
  const events = REPLAY_FIXTURE.events.filter((e) => e.emits !== false).slice(0, 3);
  clock.observe(events.slice(0, 1), 0);
  expect(clock.sample(events, 100)).toEqual({});
  clock.observe(events, 100);
  expect(Object.keys(clock.sample(events, 350))).toHaveLength(2);
  expect(new Set(Object.values(clock.flightSeeds())).size).toBe(2);
  expect(clock.sample(events, 100 + (FLIGHT_SECONDS + LANDING_SECONDS) * 1000 + 1)).toEqual({});
  const restarted = new LiveEmissionClock();
  restarted.observe(events, 1400);
  expect(restarted.sample(events, 1450)).toEqual({});
});

test("branch returns are durable, deduplicated and absent after a stop", () => {
  const child: OrchestrationChildThread = {
    id: "branch-a",
    parentWorkspaceId: "w",
    parentSessionId: "parent",
    childWorkspaceId: "w",
    childSessionId: "child",
    title: "Research",
    goal: "Review",
    status: "complete",
    latestTranscript: "Verified result",
    transcript: [],
    evidence: [],
    createdAt: "2026-10-28T12:00:00Z",
    updatedAt: "2026-10-28T12:01:00Z",
  };
  const base = {
    sessionRef: { workspaceId: "w", sessionId: "child" },
    timestamp: child.updatedAt,
    runId: "run-1",
  };
  const event = {
    ...base,
    type: "runCompleted" as const,
    snapshot: {
      ref: base.sessionRef,
      workspace: { workspaceId: "w", path: "/scratch" },
      title: "Research",
      status: "idle" as const,
      updatedAt: base.timestamp,
    },
  };
  const receipt = branchReturnEvidence(child, event)!;
  expect(receipt.detail).toContain("Verified result");
  expect(receipt.detail).toContain("继续完成你在当前会话中已获授权的原任务");
  expect(branchReturnEvidence({ ...child, evidence: [receipt] }, event)).toBeUndefined();
  expect(branchReturnEvidence(child, { ...event, outcome: "aborted" })).toBeUndefined();
  expect(
    branchReturnEvidence(child, {
      ...base,
      type: "runFailed",
      error: { message: "Provider failed" },
    })?.detail,
  ).toContain("Provider failed");
  const saved = { ...child, evidence: [{ ...receipt, status: "accepted" as const }] };
  const lanes = new Set(["lane:parent", "lane:child"]);
  const events = parallelTreeEvents([], [saved], lanes);
  expect(events.map((e) => e.kind)).toEqual(["fork", "checkpoint", "merge"]);
  expect(events.find((e) => e.kind === "merge")?.reference).toBe("branch:branch-a:start");
  expect(
    parallelTreeEvents([], [JSON.parse(JSON.stringify(saved)) as OrchestrationChildThread], lanes),
  ).toEqual(events);
  const deliveries = ["12:00:30", "12:02:30"].map((time, i) => ({
    id: `delivery-${i}`,
    index: i,
    time: i,
    lane: "lane:child",
    kind: "artifact" as const,
    actor: "selected-model",
    label: `Delivery ${i}`,
    summary: `Saved result ${i}`,
    evidenceTimestamp: `2026-10-28T${time}Z`,
  }));
  const historicalJoin = parallelTreeEvents(
    deliveries,
    [{ ...saved, latestTranscript: "A newer follow-up result" }],
    lanes,
  ).find((e) => e.kind === "merge");
  expect(historicalJoin?.reference).toBe("delivery-0");
  expect(historicalJoin?.summary).toBe("Saved result 0");
  expect(conversationRoot({ workspaceId: "w", sessionId: "child" }, [saved])).toEqual({
    workspaceId: "w",
    sessionId: "parent",
  });
});

test("module templates persist, copy per conversation and delete without losing configuration", async () => {
  const path = await mkdtemp(join(tmpdir(), "lancer-modules-"));
  const store = new LancerAssistantStore(path);
  await store.load();
  const module = {
    id: "module-proof",
    label: "自定义研究",
    color: "#123456",
    description: "研究说明",
    workflow: {
      steps: [
        {
          title: "分析",
          model: { provider: "openai", modelId: "gpt-5" },
          skills: ["research"],
          goal: "核查事实",
          deliverables: "报告",
        },
      ],
    },
  };
  await store.change(
    decodeLancerAction({ kind: "save-module", module }) as Extract<
      ReturnType<typeof decodeLancerAction>,
      { kind: "save-module" }
    >,
  );
  const target = { workspaceId: "w", sessionId: "s" };
  await store.inheritWorkflow(target, module.id);
  await store.change({
    kind: "save-module",
    module: { ...module, workflow: { steps: [{ title: "新版" }] } },
  });
  await store.change({ kind: "delete-module", id: module.id });
  const restored = await new LancerAssistantStore(path).load();
  expect(restored.modules?.find((m) => m.id === module.id)).toMatchObject({
    deleted: true,
    workflow: { steps: [{ title: "新版" }] },
  });
  expect(restored.workflows?.["w:s"]?.steps[0]).toMatchObject({
    goal: "核查事实",
    deliverables: "报告",
    skills: ["research"],
  });
  expect(() =>
    decodeLancerAction({ kind: "save-module", module: { ...module, label: " " } }),
  ).toThrow();
  expect(() =>
    decodeLancerAction({ kind: "save-module", module: { ...module, id: "chat" } }),
  ).toThrow();
});

test("recursive branches keep every fork and merge below its source regardless of record order", () => {
  const branch = (
    id: string,
    parent: string,
    start: number,
    end: number,
  ): OrchestrationChildThread => ({
    id,
    parentWorkspaceId: "w",
    parentSessionId: parent,
    childWorkspaceId: "w",
    childSessionId: id,
    title: id,
    goal: id,
    status: "complete",
    latestTranscript: id,
    transcript: [],
    createdAt: `2026-10-29T12:00:0${start}Z`,
    updatedAt: `2026-10-29T12:00:0${end}Z`,
    evidence: [
      {
        id: `return-${id}`,
        childThreadId: id,
        kind: "worker_report",
        source: "worker-reported",
        status: "accepted",
        title: "完成",
        toolName: "lancer-branch-return",
        createdAt: `2026-10-29T12:00:0${end}Z`,
      },
    ],
  });
  const parent = branch("child", "root", 0, 8),
    grandchild = branch("grandchild", "child", 1, 6);
  const lanes = new Set(["lane:root", "lane:child", "lane:grandchild"]);
  const input = Array.from({ length: 5 }, (_, i) => ({
    id: `work-${i}`,
    index: i,
    time: i,
    lane: "lane:grandchild",
    kind: "checkpoint" as const,
    actor: "selected-model",
    label: "完成一步",
    summary: "完成一步",
    evidenceTimestamp: `2026-10-29T12:00:0${i + 1}Z`,
  }));
  for (const children of [
    [parent, grandchild],
    [grandchild, parent],
  ]) {
    const events = parallelTreeEvents(input, children, lanes);
    for (const event of events.filter((e) => e.reference)) {
      const source = events.find((e) => e.id === event.reference)!;
      expect(event.row, `${source.id} → ${event.id}`).toBeGreaterThan(source.row!);
    }
    const join = events.find((e) => e.id === "return-child")!;
    expect(join.row).toBeGreaterThan(events.find((e) => e.id === "return-grandchild")!.row!);
  }
});
