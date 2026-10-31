import type { RuntimeJournalEvent } from "./runtime-journal";

/** Pi tool updates contain cumulative output. Replace the call's body instead
 * of appending every cumulative snapshot; assistant tokens are true deltas. */
export function orbOutput(events: readonly RuntimeJournalEvent[]): string {
  const blocks: string[] = [];
  const calls = new Map<string, number>();
  let assistantIndex = -1;
  for (const event of events) {
    if (event.kind === "assistantDelta") {
      if (assistantIndex < 0) {
        assistantIndex = blocks.length;
        blocks.push("");
      }
      blocks[assistantIndex] += event.text;
    } else if (event.kind === "toolStarted") {
      assistantIndex = -1;
      blocks.push(`$ ${event.text}`);
      if (event.callId) {
        calls.set(`${event.runId ?? ""}:${event.callId}`, blocks.length);
        blocks.push("");
      }
    } else if (event.kind === "toolUpdated" || event.kind === "toolFinished") {
      assistantIndex = -1;
      const key = `${event.runId ?? ""}:${event.callId ?? event.seq}`;
      let index = calls.get(key);
      if (index === undefined) {
        index = blocks.length;
        calls.set(key, index);
        blocks.push("");
      }
      if (event.text) blocks[index] = event.text;
      if (event.kind === "toolFinished" && event.exitCode !== undefined)
        blocks[index] += `\n[exit ${event.exitCode}]`;
    } else if (
      event.kind === "runCompleted" ||
      event.kind === "runFailed" ||
      event.kind === "hostUiRequest"
    ) {
      assistantIndex = -1;
      blocks.push(`[${event.text}]`);
    }
  }
  return blocks.filter(Boolean).join("\n\n");
}
