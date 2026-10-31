import { FLIGHT_SECONDS } from "../../src/features/conversation/lancer-process/process-math";
import { expect, test } from "@playwright/test";
import {
  processCurveRoutes,
  processTreeRoutes,
  cubicPoint,
  type CurveKey,
} from "../../src/features/conversation/lancer-process/process-curve-routes";
import { REPLAY_FIXTURE } from "../../src/features/conversation/lancer-process/replay-fixture";
import type {
  ProcessEvent,
  ProcessViewState,
} from "../../src/features/conversation/lancer-process/process-types";
import type { Point } from "../../src/features/conversation/lancer-process/process-math";

const state = (time: number): ProcessViewState => ({
  time,
  lane: "all",
  focus: "",
  highlighted: null,
  open: new Set(),
});
function routes(
  event: ProcessEvent,
  at: ProcessViewState,
  anchors: readonly (readonly [CurveKey, Point])[],
) {
  const map = new Map(anchors);
  return processCurveRoutes(
    { ...REPLAY_FIXTURE, events: [event] },
    at,
    true,
    (key) => map.get(key) ?? null,
  );
}
const a = { x: 305.125, y: 350.625 },
  b = { x: 1005.25, y: 410.125 };

test("selection binds identical event IDs, never the closest physical tree node", () => {
  const event = REPLAY_FIXTURE.events.find((e) => e.kind === "artifact")!;
  const result = routes(event, { ...state(event.time + 1), highlighted: event.id }, [
    [`chat:${event.id}`, a],
    [`tree:${event.id}`, b],
    ["tree:unrelated", a],
  ]);
  expect(result).toHaveLength(1);
  expect(result[0]!.target).toBe(`tree:${event.id}`);
  expect(cubicPoint(result[0]!.points, 0)).toEqual(a);
  expect(cubicPoint(result[0]!.points, 1)).toEqual(b);
});

test("a clipped target hides its route instead of using another visible node", () => {
  const event = REPLAY_FIXTURE.events.find((e) => e.kind === "artifact")!;
  expect(
    routes(event, { ...state(event.time + 1), highlighted: event.id }, [
      [`chat:${event.id}`, a],
      ["tree:unrelated", b],
    ]),
  ).toEqual([]);
});

test("handoff's two legs target the receiver chip, then the exact event node", () => {
  const event = REPLAY_FIXTURE.events.find((e) => e.kind === "handoff")!;
  const anchors: (readonly [CurveKey, Point])[] = [
    [`chip:${event.lane}:${event.actor}`, a],
    [`chip:${event.lane}:${event.targetActor}`, { x: 550, y: 100 }],
    [`tree:${event.id}`, b],
  ];
  const transfer = routes(event, state(event.time - FLIGHT_SECONDS * 0.75), anchors)[0]!;
  expect(transfer.source).toBe(`chip:${event.lane}:${event.actor}`);
  expect(transfer.target).toBe(`chip:${event.lane}:${event.targetActor}`);
  const arrival = routes(event, state(event.time - FLIGHT_SECONDS * 0.15), anchors)[0]!;
  expect(transfer.color).toBe(REPLAY_FIXTURE.lanes.find((lane) => lane.id === event.lane)?.color);
  expect(arrival.color).toBe(transfer.color);
  expect(arrival.source).toBe(transfer.target);
  expect(arrival.target).toBe(`tree:${event.id}`);
});

test("cross-line references and retries use their explicit semantic targets", () => {
  const reference = REPLAY_FIXTURE.events.find((e) => e.reference)!;
  const ref = processTreeRoutes(REPLAY_FIXTURE, state(reference.time + 1), (event) =>
    event.id === reference.reference ? a : b,
  ).find((route) => route.id === `reference:${reference.id}`)!;
  expect(ref.source).toBe(`tree:${reference.reference}`);
  expect(ref.target).toBe(`tree:${reference.id}`);
  expect(ref.dashed).toBe(true);
  const retry = REPLAY_FIXTURE.events.find((e) => e.retryTarget)!;
  const back = processTreeRoutes(REPLAY_FIXTURE, state(retry.time + 1), (event) =>
    event.id === retry.id ? a : b,
  ).find((route) => route.id === `retry:${retry.id}`)!;
  expect(back.target).toBe(`tree:${retry.retryTarget}`);
  expect(back.dashed).toBe(true);
});

test("a branch stays connected to its real parent outside the viewport", () => {
  const reference = REPLAY_FIXTURE.events.find((event) => event.reference)!;
  const parent = REPLAY_FIXTURE.events.find((event) => event.id === reference.reference)!;
  const data = { ...REPLAY_FIXTURE, events: [parent, reference] };
  const offscreen = { x: -112, y: -64 };
  const result = processTreeRoutes(data, state(reference.time + 1), (event) =>
    event.id === parent.id ? offscreen : b,
  );
  expect(result).toHaveLength(1);
  expect(result[0]!.points[0]).toEqual(offscreen);
  expect(result[0]!.points[3]).toEqual(b);
  expect(result[0]!.color).toBe(data.lanes.find((lane) => lane.id === parent.lane)!.color);
  // The screen overlay cannot draw a second copy or substitute a nearby anchor.
  expect(
    routes(reference, state(reference.time + 1), [
      [`tree:${parent.id}`, a],
      [`tree:${reference.id}`, b],
    ]),
  ).toEqual([]);
});

test("filtered and future parents never generate a fabricated tree connection", () => {
  const reference = REPLAY_FIXTURE.events.find((event) => event.reference)!;
  const parent = REPLAY_FIXTURE.events.find((event) => event.id === reference.reference)!;
  expect(
    processTreeRoutes(
      { ...REPLAY_FIXTURE, events: [reference] },
      state(reference.time + 1),
      () => b,
    ),
  ).toEqual([]);
  expect(
    processTreeRoutes(
      { ...REPLAY_FIXTURE, events: [reference, { ...parent, time: reference.time + 10 }] },
      state(reference.time + 1),
      () => b,
    ),
  ).toEqual([]);
});

test("scripted highlights do not leave a permanent selected curve after a flight", () => {
  const event = REPLAY_FIXTURE.events.find((e) => e.kind === "artifact")!;
  const anchors: (readonly [CurveKey, Point])[] = [
    [`chat:${event.id}`, a],
    [`tree:${event.id}`, b],
  ];
  const scripted = { ...state(event.time + 2), highlighted: event.id, traceSelection: false };
  expect(routes(event, scripted, anchors)).toEqual([]);
  expect(routes(event, { ...scripted, hovered: event.id }, anchors)).toHaveLength(1);
});

test("model and bubble flights share the exact event node and tree color", () => {
  const event = {
    ...REPLAY_FIXTURE.events.find((e) => e.kind === "artifact")!,
    modelFamily: "openai",
  };
  const result = routes(event, state(event.time - 0.25), [
    [`chat:${event.id}`, a],
    ["family:openai", { x: 300, y: 20 }],
    [`tree:${event.id}`, b],
  ]).filter((route) => route.kind === "flight");
  expect(result.map((route) => route.source)).toEqual(["family:openai", `chat:${event.id}`]);
  for (const route of result) {
    expect(route.target).toBe(`tree:${event.id}`);
    expect(route.points[3]).toEqual(b);
    expect(route.color).toBe(REPLAY_FIXTURE.lanes.find((lane) => lane.id === event.lane)!.color);
  }
});
