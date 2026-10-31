import assert from "node:assert/strict";
import test from "node:test";
import type { SessionDriverEvent } from "@lancer/session-driver";
import { SessionSupervisor } from "../dist/index.js";

await test("requested abort emits only idle state, without completion or failure notifications", () => {
  const record = {
    ref: { workspaceId: "workspace", sessionId: "session" },
    workspace: { workspaceId: "workspace", path: "/synthetic/workspace" },
    title: "Cancelled turn",
    status: "running",
    updatedAt: new Date().toISOString(),
    runningRunId: "run",
    cancellationRequested: true,
    queuedMessages: [],
  };
  // Exercise the runtime-event translation directly; no live session, provider,
  // disk state or credentials are needed to prove the emitted event contract.
  const supervisor = new SessionSupervisor() as unknown as {
    mapAgentEvent(input: typeof record, event: unknown): SessionDriverEvent[];
  };
  supervisor.mapAgentEvent(record, {
    type: "agent_end",
    messages: [{ role: "assistant", stopReason: "aborted", errorMessage: "Request was aborted" }],
  });
  const events = supervisor.mapAgentEvent(record, { type: "agent_settled" });
  assert.deepEqual(
    events.map((event) => event.type),
    ["sessionUpdated"],
  );
  const cancelledEvent = events[0];
  assert.equal(cancelledEvent?.type, "sessionUpdated");
  if (cancelledEvent?.type !== "sessionUpdated") throw new Error("Expected idle update");
  assert.equal(cancelledEvent.outcome, "aborted");
  assert.equal(cancelledEvent.snapshot.status, "idle");
  assert.equal(record.status, "idle");
  assert.equal(record.runningRunId, undefined);
  assert.equal(record.cancellationRequested, false);
  const startedEvents = supervisor.mapAgentEvent(record, { type: "agent_start" });
  for (const event of startedEvents) {
    if (event.type === "sessionUpdated") assert.equal(event.outcome, undefined);
  }
  supervisor.mapAgentEvent(record, {
    type: "agent_end",
    messages: [{ role: "assistant", stopReason: "aborted", errorMessage: "Unexpected abort" }],
  });
  const nextEvents = supervisor.mapAgentEvent(record, { type: "agent_settled" });
  assert.equal(nextEvents[0]?.type, "runFailed", "the cancellation marker is consumed once");
});
