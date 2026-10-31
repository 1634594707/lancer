import { expect, test } from "@playwright/test";
import {
  clock,
  currentActor,
  eventLanes,
  eventPoint,
  knownDurationSeconds,
  nativeClock,
} from "../../src/features/conversation/lancer-process/process-math";
import { REPLAY_FIXTURE } from "../../src/features/conversation/lancer-process/replay-fixture";

test("process geometry recomputes lane centers and time scale at the supplied size", () => {
  const event = { ...REPLAY_FIXTURE.events[0]!, lane: "x", time: 13.25 };
  expect(eventPoint(event, REPLAY_FIXTURE, 452, 584)).toEqual({ x: 355, y: 291 });
  expect(eventPoint(event, REPLAY_FIXTURE, 600, 434)).toEqual({ x: 466, y: 216 });
});

test("live work-tree rows advance downward from the top at a fixed spacing", () => {
  const event = { ...REPLAY_FIXTURE.events[0]!, row: 3, time: 20 };
  expect(eventPoint(event, REPLAY_FIXTURE, 452, 584).y).toBe(112);
});

test("process geometry only reserves columns for lanes with real events", () => {
  const lancerOnly = {
    ...REPLAY_FIXTURE,
    events: REPLAY_FIXTURE.events.filter((event) => event.lane === "l"),
  };
  const lancerEvent = lancerOnly.events[0]!;
  expect(eventLanes(lancerOnly).map((lane) => lane.id)).toEqual(["l"]);
  expect(eventPoint(lancerEvent, lancerOnly, 452, 584).x).toBe(16);

  const videoAndLancer = {
    ...REPLAY_FIXTURE,
    events: REPLAY_FIXTURE.events.filter((event) => event.lane === "v" || event.lane === "l"),
  };
  expect(eventLanes(videoAndLancer).map((lane) => lane.id)).toEqual(["v", "l"]);
  expect(eventPoint({ ...lancerEvent, lane: "l" }, videoAndLancer, 452, 584).x).toBe(242);
});

test("unknown tool durations are not presented as zero seconds", () => {
  expect(knownDurationSeconds([{ duration: "" }, { duration: "running" }])).toBeNull();
  expect(knownDurationSeconds([{ duration: "0.4s" }, { duration: "1.2s" }])).toBe(2);
});

test("native timestamps never fall back to the demonstration clock", () => {
  expect(nativeClock()).toBe("");
  expect(nativeClock("invalid")).toBe("");
  expect(nativeClock("2026-01-02T10:11:12Z")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  expect(clock(2)).toBe("20:10:14");
});

test("global model reel follows the source event ordering, not the selected chat", () => {
  expect(
    currentActor(REPLAY_FIXTURE, {
      time: 21.8,
      lane: "all",
      focus: "",
      open: new Set(),
      highlighted: null,
    }),
  ).toBe("sol");
  expect(
    currentActor(REPLAY_FIXTURE, {
      time: 21.8,
      lane: "v",
      focus: "",
      open: new Set(),
      highlighted: null,
    }),
  ).toBe("codex");
});
