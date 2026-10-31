import type { ProcessFixture, ProcessMessage, ProcessViewState } from "./process-types";

export function visibleProcessMessages(
  data: ProcessFixture,
  state: ProcessViewState,
): readonly ProcessMessage[] {
  const events = data.conversationEvents ?? data.events;
  if (state.lane === "all")
    return events
      .filter(
        (event) =>
          (event.kind !== "tool" || event.nativeNode) &&
          event.kind !== "start" &&
          event.time <= state.time,
      )
      .sort((a, b) => a.time - b.time)
      .flatMap(
        (event) => data.messages[event.lane]?.find((message) => message.eventId === event.id) ?? [],
      );
  const next = events.find(
    (event) =>
      event.lane === state.lane &&
      event.time > state.time &&
      event.kind !== "tool" &&
      event.kind !== "start",
  );
  return (data.messages[state.lane] ?? []).filter(
    (message) => message.time <= state.time || message.eventId === next?.id,
  );
}
