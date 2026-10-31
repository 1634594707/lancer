import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { expect, test } from "@playwright/test";
import { readRelayEvidence } from "../../electron/video-learn/relay-evidence";
import { buildRelayTree } from "../../src/features/conversation/lancer-process/relay-tree";
import { visibleProcessMessages } from "../../src/features/conversation/lancer-process/visible-process-messages";
import { LiveEmissionClock } from "../../src/features/conversation/lancer-process/live-emissions";
import { processCurveRoutes } from "../../src/features/conversation/lancer-process/process-curve-routes";
import { flightGeometry } from "../../src/features/conversation/lancer-process/process-curves";
import { eventPoint } from "../../src/features/conversation/lancer-process/process-math";
import type { ProcessViewState } from "../../src/features/conversation/lancer-process/process-types";
import type { RelayArtifact } from "../../contracts/relay-tree";

const sha = "a".repeat(64);
const snapshot = { videoId: "task", stages: [], busy: false };
const artifact: RelayArtifact = {
  step: "analysis",
  path: "learning/task/spec.json",
  sha256: sha,
  status: "passed",
  timestamp: "2026-01-01",
  statusCode: "analysis.ok",
};
const project = (artifacts: readonly RelayArtifact[] = [artifact]) =>
  buildRelayTree({
    snapshot,
    gates: [],
    artifacts,
    models: { analysis: "actual-vision", handoff: "actual-summary", remake: "actual-remake" },
  });

test("five dependency columns, no fabricated artifact or model", () => {
  const tree = project([]);
  expect(tree.lanes.map((l) => l.id)).toEqual([
    "relay:download",
    "relay:media",
    "relay:analysis",
    "relay:handoff",
    "relay:remake",
  ]);
  expect(tree.events).toEqual([]);
  expect(tree.lanes[2]!.name).toBe("看帧 · actual-vision");
  expect(tree.lanes[0]!.name).toBe("下载 · 本地导入");
});
test("retries retain immutable identities and errors; messages bind event anchors", () => {
  const tree = project([
    artifact,
    {
      ...artifact,
      path: "learning/task/second/spec.json",
      timestamp: "2026-01-02",
      sha256: "b".repeat(64),
      status: "failed",
      errorCode: "E_MODEL_BAD_REF",
    },
  ]);
  const products = tree.events.filter((event) => event.artifacts);
  expect(products).toHaveLength(1);
  expect(products[0]!.fail).toBe(true);
  expect(products[0]!.label).toContain("E_MODEL_BAD_REF");
  expect(
    tree.messages["relay:analysis"]!.some((message) =>
      message.steps?.some((step) => step.detail.includes(sha)),
    ),
  ).toBe(true);
  for (const event of products)
    expect(
      tree.messages[event.lane]!.find((message) => message.eventId === event.id)!.anchorId,
    ).toBe(event.id);
  expect(tree.events.filter((event) => event.kind === "fork")).toHaveLength(1);
  expect(tree.events.filter((event) => event.kind === "merge")).toHaveLength(0);
  const failedBranch = products[0]!.branchId;
  expect(
    tree.events.filter((event) => event.branchId === failedBranch && event.kind === "merge"),
  ).toEqual([]);
  expect(tree.events.map((event) => event.time)).toEqual(
    [...tree.events.map((event) => event.time)].sort((a, b) => a - b),
  );
  expect(project([artifact])).toEqual(project([artifact]));
});
test("one gate/run has one node, one block and a complete artifact list", () => {
  const files: RelayArtifact[] = [
    artifact,
    { ...artifact, path: "learning/task/receipt.json", sha256: "b".repeat(64) },
    ...["scene.js", "terra-receipt.json", "sol-receipt.json"].map((name, index) => ({
      ...artifact,
      step: "remake" as const,
      runId: "old-run",
      path: `remake/out/task/old-run/${name}`,
      timestamp: `2026-01-0${index + 1}`,
      status: "unverified" as const,
      statusCode: "unverified",
    })),
  ];
  const tree = project(files);
  const products = tree.events.filter((event) => event.artifacts);
  expect(products).toHaveLength(2);
  expect(tree.messages["relay:analysis"]).toHaveLength(1);
  expect(products[0]!.artifacts).toHaveLength(2);
  expect(tree.messages["relay:analysis"]![0]!.steps).toHaveLength(2);
  const old = products.find((event) => event.runId === "old-run")!;
  expect(old.unverified).toBe(true);
  expect(old.kind).toBe("artifact");
  expect(old.running).toBe(false);
  expect(old.fail).toBe(false);
  expect(old.artifacts).toHaveLength(3);
  expect(tree.messages["relay:remake"]).toHaveLength(1);
});
test("older failures collapse into one evidence-backed retry; latest branch merges", () => {
  const attempts: RelayArtifact[] = Array.from({ length: 5 }, (_, index) => ({
    ...artifact,
    path: `_gates/analysis.attempt-${index}.json`,
    timestamp: `2026-01-0${index + 2}`,
    startedAt: `2026-01-0${index + 1}`,
    status: index === 4 ? "passed" : "failed",
    errorCode: index === 4 ? undefined : "E_MODEL_FAIL",
  }));
  const tree = project(attempts);
  const forks = tree.events.filter((event) => event.kind === "fork");
  expect(forks).toHaveLength(1);
  const collapsed = tree.events.find((event) => event.label === "×4 次重试" && event.fail)!;
  expect(collapsed.summary).toContain("analysis.attempt-0.json");
  expect(collapsed.summary).toContain("analysis.attempt-3.json");
  expect(tree.events.filter((event) => event.kind === "retry")).toHaveLength(1);
  expect(tree.events.find((event) => event.kind === "retry")!.retryTarget).toBe(collapsed.id);
  expect(
    tree.messages["relay:analysis"]!.find((message) => message.eventId === collapsed.id)!.steps,
  ).toHaveLength(4);
  const xs = forks.map((fork) => {
    const leaf = tree.events.find((event) => event.branchId === fork.branchId && event.artifacts)!;
    const p = eventPoint({ ...leaf, time: fork.time + 1.2 }, tree, 452, 584);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeGreaterThan((2 * 452) / 5);
    expect(p.x).toBeLessThan((3 * 452) / 5);
    return p.x;
  });
  expect(new Set(xs).size).toBe(1);
  for (const fork of forks) {
    const terminal = tree.events.find(
      (event) => event.branchId === fork.branchId && (event.fail || event.kind === "merge"),
    )!;
    expect(terminal.time - fork.time).toBeGreaterThanOrEqual(2.4 - 1e-9);
  }
  expect(tree.events.filter((event) => event.kind === "merge")).toHaveLength(1);
  expect(tree.nodeLabels).toBe(false);
});
test("same-timestamp retained run has an ordered branch and preserves evidence time", () => {
  const tree = project([
    { ...artifact, step: "remake", runId: "zero", status: "unverified", statusCode: "unverified" },
  ]);
  const fork = tree.events.find((event) => event.kind === "fork")!;
  const leaf = tree.events.find((event) => event.artifacts)!;
  expect(leaf.time).toBeGreaterThan(fork.time);
  expect(leaf.summary).toContain(artifact.timestamp);
  expect(eventPoint(leaf, tree, 452, 584).x).toBeGreaterThan(eventPoint(fork, tree, 452, 584).x);
  expect(tree.events.some((event) => event.kind === "merge")).toBe(false);
});
test("reused source retains every gate's evidence and emits references", () => {
  const source = (id: string): RelayArtifact[] => [
    {
      ...artifact,
      step: "download",
      gatePath: `_gates/download.${id}.json`,
      path: `raw/${id}/source.mp4`,
      timestamp: `2026-01-0${id}`,
    },
    {
      ...artifact,
      step: "download",
      gatePath: `_gates/download.${id}.json`,
      path: `raw/${id}/meta.json`,
      sha256: id.repeat(64),
      timestamp: `2026-01-0${id}`,
    },
  ];
  const tree = project([...source("1"), ...source("2")]);
  const products = tree.events.filter((event) => event.artifacts);
  expect(products).toHaveLength(1);
  expect(products[0]!.artifacts).toHaveLength(4);
  const refs = tree.events.filter((event) => event.kind === "xref");
  expect(refs).toHaveLength(1);
  expect(refs[0]!.reference).toBe(products[0]!.id);
  expect(refs[0]!.time).toBeGreaterThan(products[0]!.time);
  const state: ProcessViewState = {
    time: 26.5,
    lane: "all",
    focus: "",
    highlighted: null,
    open: new Set(),
  };
  const messages = visibleProcessMessages(tree, state);
  expect(messages).toHaveLength(2);
  expect(messages.map((message) => message.steps!.length)).toEqual([2, 2]);
  expect(messages[0]!.steps![0]!.detail).toContain("raw/1/");
  expect(messages[1]!.steps![0]!.detail).toContain("raw/2/");
  const samePaths = project([
    ...source("1"),
    ...source("2").map((item) => ({ ...item, path: item.path.replace("raw/2/", "raw/1/") })),
  ]);
  expect(visibleProcessMessages(samePaths, state).map((message) => message.steps!.length)).toEqual([
    2, 2,
  ]);
});

test("run stages are sequential and long histories stay inside the live timeline", () => {
  const attempts: RelayArtifact[] = Array.from({ length: 12 }, (_, index) => {
    const id = `run${index}`;
    return (["media", "analysis"] as const).map((step) => ({
      ...artifact,
      step,
      gatePath: `_gates/${step}.${id}.json`,
      path: `learning/${id}/${step}.json`,
      sha256: index.toString(16).padStart(64, "0"),
      timestamp: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    }));
  }).flat();
  const tree = project(attempts);
  expect(tree.timelineEnd).toBe(26.5);
  expect(tree.minimumGraphHeight).toBeUndefined();
  expect(Math.max(...tree.events.map((event) => event.time))).toBeLessThan(tree.timelineEnd!);
  const media = tree.events.find((e) => e.kind === "merge" && e.id.includes("media.run11"))!;
  const analysis = tree.events.find((e) => e.kind === "fork" && e.id.includes("analysis.run11"))!;
  expect(analysis.time).toBeGreaterThan(media.time);
  expect(tree.events.filter((event) => event.kind === "fork")).toHaveLength(2);
  expect(tree.messages["relay:analysis"]).toHaveLength(12);
  const state: ProcessViewState = {
    time: 26.5,
    lane: "all",
    focus: "",
    highlighted: null,
    open: new Set(),
  };
  const visible = visibleProcessMessages(tree, state);
  const analysisMessages = visible.filter((message) => message.eventId?.includes("analysis.run"));
  expect(analysisMessages).toHaveLength(12);
  expect(analysisMessages.map((message) => message.steps![0]!.detail)).toEqual(
    Array.from({ length: 12 }, (_, index) =>
      expect.stringContaining(`learning/run${index}/analysis.json`),
    ),
  );
  expect(visibleProcessMessages(tree, { ...state, lane: "relay:analysis" })).toHaveLength(12);
  expect(
    analysisMessages.every((message) =>
      tree.conversationEvents!.some((event) => event.id === message.eventId),
    ),
  ).toBe(true);
});

test("folded failed gates and historical unverified runs remain visible in conversation", () => {
  const tree = project([
    {
      ...artifact,
      gatePath: "_gates/analysis.old.json",
      timestamp: "2026-01-01",
      status: "failed",
      errorCode: "E_OLD",
    },
    { ...artifact, gatePath: "_gates/analysis.new.json", timestamp: "2026-01-02" },
    {
      ...artifact,
      step: "remake",
      runId: "old",
      timestamp: "2026-01-03",
      status: "unverified",
      statusCode: "unverified",
    },
    { ...artifact, step: "remake", runId: "new", timestamp: "2026-01-04", status: "passed" },
  ]);
  const state: ProcessViewState = {
    time: 26.5,
    lane: "all",
    focus: "",
    highlighted: null,
    open: new Set(),
  };
  const visible = visibleProcessMessages(tree, state);
  for (const identity of ["analysis.old", "analysis.new", "remake:old", "remake:new"]) {
    const message = visible.find((item) => item.id.includes(identity));
    expect(message, identity).toBeDefined();
    expect(tree.conversationEvents!.find((event) => event.id === message!.eventId)).toBeDefined();
  }
  const old = tree.conversationEvents!.find((event) => event.id.includes("remake:old"))!;
  expect(old.unverified).toBe(true);
  expect(tree.events.some((event) => event.id === old.id)).toBe(false);
  expect(
    visible.find((message) => message.id.includes("analysis.old"))!.steps![0]!.detail,
  ).toContain("E_OLD");
});

test("identical paths in different analysis gates remain distinct attempts", () => {
  const tree = project(
    ["one", "two"].map((id) => ({
      ...artifact,
      gatePath: `_gates/analysis.${id}.json`,
      timestamp: id === "one" ? "2026-01-01" : "2026-01-02",
    })),
  );
  expect(tree.events.filter((event) => event.artifacts)).toHaveLength(1);
  expect(tree.events.filter((event) => event.kind === "fork")).toHaveLength(1);
  expect(tree.messages["relay:analysis"]).toHaveLength(2);
});

test("current-ready without a gate stays unverified (C must-fix 3)", async () => {
  const root = test.info().outputPath("ready-without-gate");
  const runDir = "remake/out/task/old-run";
  mkdirSync(join(root, runDir), { recursive: true });
  mkdirSync(join(root, "_gates"), { recursive: true });
  writeFileSync(
    join(root, "remake/out/task/current.json"),
    JSON.stringify({ status: "ready", runDir }),
  );
  for (const name of ["scene.js", "terra-receipt.json", "sol-receipt.json"])
    writeFileSync(
      join(root, runDir, name),
      JSON.stringify({ model: name.startsWith("terra") ? "gpt-6.1-terra" : "gpt-6.1-sol" }),
    );
  const evidence = await readRelayEvidence(root, "task");
  expect(evidence.artifacts).toHaveLength(3);
  expect(evidence.artifacts.every((a) => a.status === "unverified")).toBe(true);
  const tree = buildRelayTree({ ...evidence, snapshot });
  const products = tree.events.filter((event) => event.artifacts);
  expect(products).toHaveLength(1);
  expect(products[0]!.unverified).toBe(true);
  expect(
    tree.events.some(
      (event) => event.kind === "wait" || event.kind === "commit" || event.kind === "merge",
    ),
  ).toBe(false);
});
test("historical baseline never replays; new events fly for 1200ms then land for 600ms", () => {
  const clock = new LiveEmissionClock();
  const event = project().events.find((event) => event.artifacts)!;
  clock.observe([], 0);
  clock.observe([event], 100);
  expect(clock.sample([event], 700)[event.id]).toBeCloseTo(event.time - 0.6);
  expect(clock.sample([event], 1300)[event.id]).toBe(event.time);
  expect(clock.sample([event], 1600)[event.id]).toBeCloseTo(event.time + 0.3);
  expect(clock.sample([event], 1900)).toEqual({});
  const restarted = new LiveEmissionClock();
  restarted.observe([event], 800);
  expect(restarted.sample([event], 900)).toEqual({});
  const changed = { ...event, statusCode: "analysis.fail", fail: true };
  restarted.observe([changed], 1000);
  expect(Object.keys(restarted.sample([changed], 1100))).toEqual([event.id]);
  const all = project().events;
  const once = new LiveEmissionClock();
  once.observe([], 0);
  once.observe(all, 100);
  expect(Object.keys(once.sample(all, 200))).toEqual([event.id]);
});
for (const kind of ["artifact", "handoff"] as const)
  for (const chatVisible of [true, false])
    for (const progress of [0.25, 0.5, 0.75]) {
      test(`${kind} flight live/replay identical at ${progress}, chat=${chatVisible}`, () => {
        const base = project();
        const event = {
          ...base.events.find((event) => event.artifacts)!,
          kind,
          time: 2,
          emits: true,
          targetActor: "relay-model:handoff",
        };
        const data = { ...base, events: [event] };
        const state: ProcessViewState = {
          time: 2 - 1.2 + (progress * 1200) / 1000,
          lane: "all",
          focus: "",
          highlighted: null,
          open: new Set(),
        };
        const read = (key: string) =>
          key.startsWith("tree:")
            ? { x: 900, y: 300 }
            : key.startsWith("chat:")
              ? chatVisible
                ? { x: 300, y: 200 }
                : null
              : key.includes("handoff")
                ? { x: 600, y: 50 }
                : { x: 400, y: 50 };
        const clock = new LiveEmissionClock();
        clock.observe([], 0);
        clock.observe([event], 100);
        const live = processCurveRoutes(
          data,
          { ...state, time: 26.5, flightTimes: clock.sample([event], 100 + progress * 1200) },
          true,
          read,
        ).filter((r) => r.kind === "flight");
        const replay = processCurveRoutes(data, state, true, read).filter(
          (r) => r.kind === "flight",
        );
        expect(live.length).toBeGreaterThan(0);
        expect(live.map(flightGeometry)).toEqual(replay.map(flightGeometry));
        if (chatVisible) expect(live[0]!.id).toContain(":chat");
        else if (kind === "handoff")
          expect(live[0]!.id).toContain(progress < 0.45 ? ":transfer" : ":arrival");
        expect(
          processCurveRoutes(data, state, false, read).filter((r) => r.kind === "flight"),
        ).toEqual([]);
      });
    }

test("real disk artifacts equal Lane B golden paths, hashes, status, run_id (RULING-1)", async () => {
  const file = process.env.LANCER_RELAY_GOLDEN;
  const workspace = process.env.LANCER_RELAY_DISK_ROOT;
  test.skip(
    !file && !workspace,
    "Retained local evidence is optional; set LANCER_RELAY_GOLDEN and LANCER_RELAY_DISK_ROOT to verify it",
  );
  if (!file || !workspace || !isAbsolute(file) || !isAbsolute(workspace)) {
    throw new Error("LANCER_RELAY_GOLDEN and LANCER_RELAY_DISK_ROOT must both be absolute paths");
  }
  const golden = JSON.parse(readFileSync(file, "utf8")) as {
    video_id: string;
    columns: {
      step: string;
      model: string;
      nodes: {
        artifact: string | null;
        sha256: string | null;
        status_code: string | null;
        error_code: string | null;
        run_id: string | null;
      }[];
    }[];
    failed_runs: { gate: string; gate_sha256: string; status_code: string; error_code: string }[];
  };
  const evidence = await readRelayEvidence(workspace, golden.video_id);
  const tree = buildRelayTree({ ...evidence, snapshot: { ...snapshot, videoId: golden.video_id } });
  const expected = golden.columns.flatMap((c) => c.nodes.filter((n) => n.artifact));
  const currentRuns = new Set(expected.map((n) => n.run_id).filter(Boolean));
  const successful = tree.events.filter((e) => !e.fail && (!e.runId || currentRuns.has(e.runId)));
  const normalize = (nodes: typeof expected) =>
    [...nodes].sort((a, b) => a.artifact!.localeCompare(b.artifact!));
  expect(
    normalize(
      successful
        .flatMap((e) => e.artifacts ?? [])
        .filter((a) => a.runId || a.gatePath === `_gates/${a.step}.${golden.video_id}.json`)
        .map((a) => ({
          artifact: a.path,
          sha256: a.sha256,
          status_code: a.statusCode!,
          error_code: a.errorCode ?? null,
          run_id: a.runId ?? null,
        })),
    ),
  ).toEqual(normalize(expected));
  expect(tree.lanes[4]!.name).toBe("复刻 · Terra+Sol");
  expect(tree.lanes[4]!.title).toBe("复刻 · gpt-6.1-terra + gpt-6.1-sol");
  for (const step of ["analysis", "handoff"]) {
    expect(tree.lanes.find((lane) => lane.id === `relay:${step}`)!.title).toContain(
      golden.columns.find((column) => column.step === step)!.model,
    );
  }
  for (const failed of golden.failed_runs) {
    const found = evidence.artifacts.find(
      (a) => a.path === failed.gate && a.sha256 === failed.gate_sha256,
    );
    expect(found, failed.gate).toBeDefined();
    expect(found!.statusCode).toBe(failed.status_code);
    expect(found!.errorCode).toBe(failed.error_code);
    expect(
      Object.values(tree.messages)
        .flat()
        .some((message) => message.steps?.some((step) => step.detail.includes(failed.gate_sha256))),
    ).toBe(true);
  }
});
