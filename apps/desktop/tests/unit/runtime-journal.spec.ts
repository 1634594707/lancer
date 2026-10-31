import { expect, test } from "@playwright/test";
import type {
  SessionDriverEvent,
  SessionSnapshot,
  SessionTranscriptItem,
} from "@lancer/session-driver";
import { RuntimeJournal } from "../../electron/control/runtime-journal";

const ref = { workspaceId: "ws", sessionId: "session" };
const timestamp = "2026-01-01T00:00:00.000Z";
const base = { sessionRef: ref, timestamp };
function snapshot(status: SessionSnapshot["status"], queued = false): SessionSnapshot {
  return {
    ref,
    workspace: { workspaceId: "ws", path: "/tmp" },
    title: "Test",
    status,
    updatedAt: timestamp,
    queuedMessages: queued
      ? [{ id: "q", mode: "followUp", text: "next", createdAt: timestamp, updatedAt: timestamp }]
      : [],
  };
}

const history: readonly SessionTranscriptItem[] = [
  { kind: "message", role: "user", id: "u", text: "user text", createdAt: timestamp },
  {
    kind: "message",
    role: "assistant",
    id: "a",
    text: "echo historical-secret",
    createdAt: timestamp,
  },
  {
    kind: "tool",
    id: "t",
    callId: "c",
    toolName: "bash",
    status: "success",
    input: { token: "historical-secret" },
    output: { text: "historical-secret\nsecond line", exitCode: 0 },
    createdAt: timestamp,
  },
];

test("history seeds once without inventing state or timing and sanitizes output", () => {
  const journal = new RuntimeJournal();
  const received: unknown[] = [];
  journal.subscribe((event) => received.push(event));
  journal.seed(ref, history);
  const logs = journal.logs(ref);
  expect(logs.map((entry) => entry.kind)).toEqual([
    "assistantDelta",
    "toolStarted",
    "toolFinished",
  ]);
  expect(logs.map((entry) => entry.seq)).toEqual([1, 2, 3]);
  expect(logs[0].text).toBe("echo [REDACTED]");
  expect(logs[2]).toMatchObject({ text: "[REDACTED]\nsecond line", exitCode: 0, success: true });
  expect(JSON.stringify(logs)).not.toContain("historical-secret");
  expect(received).toEqual(logs);
  expect(journal.state(ref)).toBeUndefined();
  journal.seed(ref, history);
  expect(journal.logs(ref)).toEqual(logs);
  expect(received).toHaveLength(3);
});

test("live logs win hydration and existing state and timing remain untouched", () => {
  const journal = new RuntimeJournal(() => Date.parse(timestamp) + 1000);
  journal.observe({ ...base, type: "assistantDelta", text: "live" });
  const logs = journal.logs(ref);
  const state = journal.state(ref);
  journal.seed(ref, history);
  expect(journal.logs(ref)).toEqual(logs);
  expect(journal.state(ref)).toEqual(state);
  const other = { ...ref, sessionId: "historical" };
  journal.seed(other, history);
  expect(journal.state(other)).toBeUndefined();
  expect(journal.logs(undefined).map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5]);
});

test("tool inputs are recursively redacted before logs and subscribers receive them", () => {
  const journal = new RuntimeJournal();
  const observed: unknown[] = [];
  journal.subscribe((event) => observed.push(event));
  const input = {
    apiKey: "a",
    nested: [
      {
        TOKEN: "b",
        secret: { value: "c" },
        password: "d",
        command: "ls",
      },
    ],
  };
  journal.observe({ ...base, type: "toolStarted", toolName: "bash", callId: "c", input });
  const expected = {
    apiKey: "[REDACTED]",
    nested: [{ TOKEN: "[REDACTED]", secret: "[REDACTED]", password: "[REDACTED]", command: "ls" }],
  };
  expect(journal.logs(ref)[0].input).toEqual(expected);
  expect(observed).toEqual(journal.logs(ref));
  expect(journal.logs(ref)[0].text).toBe(`bash ${JSON.stringify(expected)}`);
  expect(input.apiKey).toBe("a");
});

test("credential redaction preserves assignment quotes and serialized JSON", () => {
  const journal = new RuntimeJournal();
  journal.observe({
    ...base,
    type: "toolStarted",
    toolName: "bash",
    callId: "c",
    input: {
      command: `KEY="private-value" token='another-value' password=third-value`,
    },
  });
  const input = { command: `KEY="[REDACTED]" token='[REDACTED]' password=[REDACTED]` };
  expect(journal.logs(ref)[0].input).toEqual(input);
  expect(journal.logs(ref)[0].text).toBe(`bash ${JSON.stringify(input)}`);
});

test("captured secrets and credential patterns are scrubbed from commands, output and errors", () => {
  const journal = new RuntimeJournal();
  const received: unknown[] = [];
  journal.subscribe((event) => received.push(event));
  journal.observe({
    ...base,
    type: "toolStarted",
    toolName: "bash",
    callId: "c",
    input: {
      nested: [{ secret: { values: ["nested-private-value"] } }],
      command: 'KEY="command-private-value" token=token-private-value echo ready',
    },
  });
  journal.observe({
    ...base,
    type: "toolFinished",
    callId: "c",
    success: false,
    output: "nested-private-value command-private-value token-private-value\nignored",
  });
  journal.observe({
    ...base,
    type: "runFailed",
    error: {
      message: "nested-private-value Bearer bearer-private-value password=error-private-value",
    },
  });
  journal.observe({
    ...base,
    type: "assistantDelta",
    text: "bearer-private-value error-private-value sk-abcdefghijklmnop123456",
  });
  const serialized = JSON.stringify(received);
  for (const secret of [
    "nested-private-value",
    "command-private-value",
    "token-private-value",
    "bearer-private-value",
    "error-private-value",
    "sk-abcdefghijklmnop123456",
  ]) {
    expect(serialized).not.toContain(secret);
    expect(JSON.stringify(journal.logs(ref))).not.toContain(secret);
    expect(journal.state(ref)?.lastLine).not.toContain(secret);
  }
  expect(serialized).toContain("[REDACTED]");
});

test("strict global cursor replay has no loss or duplicates and isolates full refs", () => {
  const journal = new RuntimeJournal();
  const received: number[] = [];
  const unsubscribe = journal.subscribe((event) => received.push(event.seq));
  for (let i = 0; i < 100; i++) {
    journal.observe({ ...base, type: "assistantDelta", text: String(i) });
    journal.observe({
      ...base,
      sessionRef: { ...ref, workspaceId: "other" },
      type: "assistantDelta",
      text: "other",
    });
  }
  const first = journal.logs(ref);
  const cursor = first.at(-1)!.seq;
  expect(journal.logs(ref, cursor)).toEqual([]);
  journal.observe({ ...base, type: "assistantDelta", text: "last" });
  const next = journal.logs(ref, cursor);
  expect(
    [...first, ...next]
      .filter((entry) => entry.kind === "assistantDelta")
      .map((entry) => entry.text),
  ).toEqual([...Array.from({ length: 100 }, (_, i) => String(i)), "last"]);
  expect(new Set(received).size).toBe(203);
  expect(received).toEqual(Array.from({ length: 203 }, (_, i) => i + 1));
  unsubscribe();
  journal.observe({ ...base, type: "assistantDelta", text: "unsubscribed" });
  expect(received).toHaveLength(203);
});

test("tool finish keeps every output line and never invents an exit code", () => {
  const journal = new RuntimeJournal();
  for (const output of [
    "first\nsecond",
    { content: [{ type: "text", text: "failed\r\nmore" }], details: { exitCode: 7 } },
    { text: "ok", exitCode: 0 },
  ]) {
    journal.observe({ ...base, type: "toolFinished", callId: "c", success: false, output });
  }
  const logs = journal.logs(ref).filter((entry) => entry.kind === "toolFinished");
  expect(logs.map((entry) => entry.text)).toEqual(["first\nsecond", "failed\r\nmore", "ok"]);
  expect(logs[0]).not.toHaveProperty("exitCode");
  expect(logs[1].exitCode).toBe(7);
  expect(logs[2].exitCode).toBe(0);
});

test("status transition table, sticky terminal state, and restart timing", () => {
  let now = Date.parse(timestamp);
  const journal = new RuntimeJournal(() => now);
  expect(journal.state(ref)).toBeUndefined();
  const table: [SessionDriverEvent, string][] = [
    [{ ...base, type: "sessionUpdated", snapshot: snapshot("idle", true) }, "queued"],
    [{ ...base, type: "sessionUpdated", snapshot: snapshot("running") }, "running"],
    [
      {
        ...base,
        type: "hostUiRequest",
        request: { kind: "confirm", requestId: "r", title: "Confirm", message: "?" },
      },
      "waiting",
    ],
    [{ ...base, type: "sessionUpdated", snapshot: snapshot("running") }, "waiting"],
    [{ ...base, type: "assistantDelta", text: "resumed" }, "running"],
    [
      {
        ...base,
        timestamp: "2026-01-01T00:00:02.000Z",
        type: "runCompleted",
        snapshot: snapshot("idle"),
      },
      "done",
    ],
    [{ ...base, type: "sessionUpdated", snapshot: snapshot("idle") }, "done"],
  ];
  for (const [event, status] of table) {
    journal.observe(event);
    expect(journal.state(ref)?.status).toBe(status);
  }
  now += 10000;
  expect(journal.state(ref)?.elapsed).toBe(2000);
  journal.observe({
    ...base,
    timestamp: new Date(now).toISOString(),
    type: "assistantDelta",
    text: "new run",
  });
  now += 500;
  expect(journal.state(ref)).toMatchObject({ status: "running", finishedAt: null, elapsed: 500 });
  journal.observe({
    ...base,
    timestamp: new Date(now).toISOString(),
    type: "runFailed",
    error: { message: "Oops" },
  });
  journal.observe({ ...base, type: "sessionUpdated", snapshot: snapshot("idle") });
  expect(journal.state(ref)).toMatchObject({ status: "failed", elapsed: 500 });
});

test("snapshot failure and idle transitions and returned copies", () => {
  const journal = new RuntimeJournal();
  journal.observe({ ...base, type: "sessionUpdated", snapshot: snapshot("running") });
  journal.observe({ ...base, type: "sessionUpdated", snapshot: snapshot("idle") });
  expect(journal.state(ref)?.status).toBe("idle");
  journal.observe({ ...base, type: "sessionUpdated", snapshot: snapshot("failed") });
  expect(journal.state(ref)?.status).toBe("failed");
  journal.state(ref)!.status = "running";
  journal.logs(ref).splice(0);
  expect(journal.state(ref)?.status).toBe("failed");
  expect(journal.logs(ref)).toHaveLength(6);
});

test("store statuses share the all-session cursor and subscriptions", () => {
  const journal = new RuntimeJournal(() => Date.parse(timestamp));
  const received: number[] = [];
  journal.subscribe((entry) => received.push(entry.seq));
  const other = { ...ref, sessionId: "other" };
  journal.status(ref, "queued");
  journal.status(other, "running");
  journal.status(ref, "running");
  journal.status(ref, "waiting");
  expect(journal.state(ref)?.status).toBe("waiting");
  journal.status(ref, "idle", "2026-01-01T00:00:02.000Z");
  expect(journal.state(ref)).toMatchObject({ status: "idle", elapsed: 2000 });
  expect(journal.logs(undefined).map((entry) => entry.seq)).toEqual(received);
  expect(journal.logs(undefined, 3).map((entry) => entry.seq)).toEqual([4, 5]);
  expect(journal.logs(other).map((entry) => entry.seq)).toEqual([2]);
});

test("observed transitions publish timed status events and unchanged statuses are suppressed", () => {
  const journal = new RuntimeJournal();
  journal.observe({ ...base, type: "assistantDelta", text: "first" });
  journal.observe({ ...base, type: "assistantDelta", text: "second" });
  journal.status(ref, "running");
  const finishedAt = "2026-01-01T00:00:02.000Z";
  journal.observe({
    ...base,
    timestamp: finishedAt,
    type: "runCompleted",
    snapshot: snapshot("idle"),
  });
  journal.status(ref, "done");
  journal.observe({ ...base, type: "sessionUpdated", snapshot: snapshot("idle") });
  const logs = journal.logs(ref);
  expect(logs.map((entry) => entry.kind)).toEqual([
    "assistantDelta",
    "status",
    "assistantDelta",
    "runCompleted",
    "status",
    "sessionUpdated",
  ]);
  expect(logs.filter((entry) => entry.kind === "status")).toEqual([
    expect.objectContaining({ status: "running", startedAt: timestamp, finishedAt: null }),
    expect.objectContaining({ status: "done", startedAt: timestamp, finishedAt }),
  ]);
});

test("aborted completion journals failure while completed and legacy outcomes remain done", () => {
  for (const outcome of ["aborted", "completed", undefined] as const) {
    const journal = new RuntimeJournal();
    journal.observe({ ...base, type: "assistantDelta", text: "started" });
    const finishedAt = "2026-01-01T00:00:02.000Z";
    const completed: SessionDriverEvent = {
      ...base,
      timestamp: finishedAt,
      type: "runCompleted",
      snapshot: snapshot("idle"),
      ...(outcome ? { outcome } : {}),
    };
    journal.observe(completed);
    const status = outcome === "aborted" ? "failed" : "done";
    const text = outcome === "aborted" ? "Run interrupted" : "Run completed";
    expect(journal.state(ref)).toMatchObject({
      status,
      startedAt: timestamp,
      finishedAt,
      elapsed: 2000,
      lastLine: text,
    });
    expect(journal.logs(ref).slice(-2)).toEqual([
      expect.objectContaining({ kind: "runCompleted", text }),
      expect.objectContaining({ kind: "status", status, startedAt: timestamp, finishedAt }),
    ]);
    expect(completed.snapshot.status).toBe("idle");
  }
});

test("cancelled session update finishes failed without a runCompleted notification", () => {
  const journal = new RuntimeJournal();
  journal.observe({ ...base, type: "assistantDelta", text: "started" });
  const finishedAt = "2026-01-01T00:00:02.000Z";
  const cancelled: SessionDriverEvent = {
    ...base,
    timestamp: finishedAt,
    type: "sessionUpdated",
    snapshot: snapshot("idle"),
    outcome: "aborted",
  };
  journal.observe(cancelled);
  expect(journal.state(ref)).toMatchObject({
    status: "failed",
    startedAt: timestamp,
    finishedAt,
    elapsed: 2000,
    lastLine: "Run interrupted",
  });
  expect(journal.logs(ref).slice(-2)).toEqual([
    expect.objectContaining({ kind: "sessionUpdated", text: "Run interrupted" }),
    expect.objectContaining({ kind: "status", status: "failed", startedAt: timestamp, finishedAt }),
  ]);
  expect(journal.logs(ref).some((entry) => entry.kind === "runCompleted")).toBe(false);
  expect(cancelled.snapshot.status).toBe("idle");
  journal.observe({ ...base, type: "sessionUpdated", snapshot: snapshot("idle") });
  expect(journal.state(ref)?.status).toBe("failed");
});

test("never-run terminal and waiting states do not fabricate run timing", () => {
  for (const status of ["idle", "done", "failed", "waiting"] as const) {
    const journal = new RuntimeJournal();
    journal.status(ref, status, timestamp);
    expect(journal.state(ref)).toMatchObject({
      status,
      startedAt: null,
      finishedAt: null,
      elapsed: 0,
    });
    expect(journal.logs(ref)[0]).toMatchObject({
      kind: "status",
      startedAt: null,
      finishedAt: null,
    });
  }
  const events: SessionDriverEvent[] = [
    { ...base, type: "runCompleted", snapshot: snapshot("idle") },
    { ...base, type: "runFailed", error: { message: "failed before start" } },
    {
      ...base,
      type: "hostUiRequest",
      request: { kind: "confirm", requestId: "r", title: "Confirm", message: "?" },
    },
  ];
  for (const event of events) {
    const journal = new RuntimeJournal();
    journal.observe(event);
    expect(journal.state(ref)).toMatchObject({ startedAt: null, finishedAt: null, elapsed: 0 });
  }
});

test("waiting preserves active timing and queuing after completion resets it", () => {
  for (const viaSnapshot of [false, true]) {
    const journal = new RuntimeJournal(() => Date.parse(timestamp) + 1000);
    journal.status(ref, "running", timestamp);
    journal.observe({
      ...base,
      type: "hostUiRequest",
      request: { kind: "confirm", requestId: "r", title: "Confirm", message: "?" },
    });
    expect(journal.state(ref)).toMatchObject({
      status: "waiting",
      startedAt: timestamp,
      finishedAt: null,
      elapsed: 1000,
    });
    journal.status(ref, "done");
    if (viaSnapshot)
      journal.observe({ ...base, type: "sessionUpdated", snapshot: snapshot("idle", true) });
    else journal.status(ref, "queued");
    expect(journal.state(ref)).toMatchObject({
      status: "queued",
      startedAt: null,
      finishedAt: null,
      elapsed: 0,
    });
  }
});

test("status publications include status and metadata even without a status change", () => {
  const journal = new RuntimeJournal(() => Date.parse(timestamp));
  const received: unknown[] = [];
  journal.subscribe((event) => received.push(event));
  journal.status(ref, "running", undefined, { stage: "build", progress: 0.25 });
  journal.status(ref, "running", undefined, {
    stage: "test",
    progress: 0.5,
    resultPath: "result.txt",
  });
  expect(journal.logs(ref)).toEqual(received);
  expect(journal.logs(ref, 1)).toEqual([
    expect.objectContaining({
      seq: 2,
      kind: "status",
      status: "running",
      ts: timestamp,
      stage: "test",
      progress: 0.5,
      resultPath: "result.txt",
    }),
  ]);
  expect(journal.state(ref)?.status).toBe("running");
});
