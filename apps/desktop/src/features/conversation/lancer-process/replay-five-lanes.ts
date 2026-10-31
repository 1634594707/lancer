import { REPLAY_FIXTURE } from "./replay-fixture";
import { PROCESS_LANE_COLORS } from "./process-palette";
import type { ProcessFixture } from "./process-types";

/** Explicit read-only five-lane geometry comparison. Never used by the live projection.
 * The original authored demo has four lanes; its last scripted lane is cloned here solely
 * to compare the same shared renderer at five-column density. Default playback is unchanged. */
export function fiveLaneReplayFixture(): ProcessFixture {
  const source = REPLAY_FIXTURE.lanes.at(-1)!;
  const id = "replay-comparison";
  const key = (value: string) => `comparison:${value}`;
  const sourceIds = new Set(
    REPLAY_FIXTURE.events.filter((event) => event.lane === source.id).map((event) => event.id),
  );
  const reference = (value: string | undefined) =>
    value ? (sourceIds.has(value) ? key(value) : value) : undefined;
  const events = REPLAY_FIXTURE.events
    .filter((event) => event.lane === source.id)
    .map((event) => ({
      ...event,
      id: key(event.id),
      lane: id,
      reference: reference(event.reference),
      retryTarget: reference(event.retryTarget),
    }));
  const messages = (REPLAY_FIXTURE.messages[source.id] ?? []).map((message) => ({
    ...message,
    id: key(message.id),
    eventId: message.eventId ? key(message.eventId) : undefined,
  }));
  return {
    ...REPLAY_FIXTURE,
    nodeLabels: false,
    lanes: [
      ...REPLAY_FIXTURE.lanes,
      { ...source, id, name: "回放对照", color: PROCESS_LANE_COLORS[0] },
    ],
    events: [...REPLAY_FIXTURE.events, ...events],
    messages: { ...REPLAY_FIXTURE.messages, [id]: messages },
    titles: {
      ...REPLAY_FIXTURE.titles,
      [id]: { title: "只读五列几何对照", branch: "replay/comparison" },
    },
  };
}
