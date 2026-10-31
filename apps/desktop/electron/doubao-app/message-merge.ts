import type { DoubaoAppMessage } from "../../contracts/doubao-app";

export function mergeMessages(
  previous: readonly DoubaoAppMessage[],
  incoming: readonly DoubaoAppMessage[],
): readonly DoubaoAppMessage[] {
  if (!incoming.length) return previous;
  const same = (a: DoubaoAppMessage, b: DoubaoAppMessage) => a.role === b.role && a.text === b.text;
  if (
    previous.length >= incoming.length &&
    previous.some((_, i) => incoming.every((m, j) => previous[i + j] && same(previous[i + j]!, m)))
  )
    return previous;
  const positions = incoming.map((message) =>
    previous.flatMap((old, index) => (same(old, message) ? [index] : [])),
  );
  const uniquePositions = positions
    .filter((matches) => matches.length === 1)
    .map(([index]) => index!);
  const repairingOrder = uniquePositions.some(
    (position, i) => i > 0 && position < uniquePositions[i - 1]!,
  );
  for (let n = repairingOrder ? 0 : Math.min(previous.length, incoming.length); n > 0; n--) {
    const start = previous.length - n;
    const matches = incoming.slice(0, n).every((m, i) => {
      const old = previous[start + i]!;
      return (
        same(old, m) ||
        (start + i === previous.length - 1 &&
          old.role === "assistant" &&
          m.role === "assistant" &&
          m.text.startsWith(old.text))
      );
    });
    if (matches) return [...previous.slice(0, start), ...incoming];
  }
  // AX virtualization can omit user bubbles between historical assistant anchors.
  // Align ordered occurrences, never globally deduplicate equal message text.
  // A partially loaded page may start with a previously omitted user bubble.
  // Two historical anchors establish its position;
  // one repeated generic answer alone must not collapse a genuine new turn.
  let prefix = incoming.findIndex((message) => previous.some((old) => same(old, message)));
  if (prefix < 0) return [...previous, ...incoming];
  if (
    prefix > 0 &&
    incoming.filter((message) => previous.some((old) => same(old, message))).length < 2
  )
    return [...previous, ...incoming];
  let aligned = incoming.slice(prefix);
  let anchor = -1;
  let bestMatches = 0;
  for (let start = 0; start < previous.length; start++) {
    if (!same(previous[start]!, aligned[0]!)) continue;
    let cursor = start;
    let matches = 0;
    for (const message of aligned) {
      const found = previous.findIndex((old, index) => index >= cursor && same(old, message));
      if (found >= 0) {
        cursor = found + 1;
        matches++;
      }
    }
    if (matches >= bestMatches) {
      anchor = start;
      bestMatches = matches;
    }
  }
  if (repairingOrder) {
    // Two unambiguous anchors prove a previously mirrored block is out of order.
    // Choose the nearest preceding occurrence of its first message, retaining
    // later duplicate answers that belong to separate turns.
    const first = positions.find((matches) => matches.length)!;
    const earliest = Math.min(...uniquePositions);
    anchor = first.filter((index) => index <= earliest).at(-1) ?? earliest;
    prefix = 0;
    aligned = [...incoming];
  }
  if (anchor >= 0) {
    const result = [...previous.slice(0, anchor), ...incoming.slice(0, prefix)];
    const moved: DoubaoAppMessage[] = [];
    let cursor = anchor;
    for (const [incomingIndex, message] of aligned.entries()) {
      const movedIndex = moved.findIndex((old) => same(old, message));
      if (movedIndex >= 0) {
        moved.splice(movedIndex, 1);
        result.push(message);
        continue;
      }
      const found = previous.findIndex((old, index) => index >= cursor && same(old, message));
      if (found >= 0) {
        // Incoming order is authoritative for the visible block. Preserve unseen
        // history, but don't reinsert an old misplaced message before its anchor.
        const later = aligned.slice(incomingIndex + 1);
        for (const old of previous.slice(cursor, found)) {
          if (later.some((next) => same(old, next))) moved.push(old);
          else result.push(old);
        }
        result.push(message);
        cursor = found + 1;
      } else {
        result.push(message);
      }
    }
    result.push(...moved, ...previous.slice(cursor));
    return result.length === previous.length && result.every((m, i) => same(m, previous[i]!))
      ? previous
      : result;
  }
  return [...previous, ...incoming];
}
