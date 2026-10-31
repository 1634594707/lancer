import { createHash } from "node:crypto";
import path from "node:path";
import type { SessionRef } from "@lancer/session-driver/types";
import type { DoubaoAppSnapshot, DoubaoAppMessage } from "../../contracts/doubao-app";
import { readJsonWithBackup, writeFileAtomicQueued } from "../persistence/atomic-file-write";

export interface SavedBinding extends DoubaoAppSnapshot {
  readonly target: SessionRef;
  readonly transcriptVersion?: 2 | 3;
  /** Original v1 mirror retained intact during the completed-only transcript migration. */
  readonly legacyMessages?: readonly DoubaoAppMessage[];
}
interface SavedState {
  version: 1;
  bindings: Record<string, SavedBinding>;
}
export function stateKey(target: SessionRef): string {
  return createHash("sha256")
    .update(JSON.stringify([target.workspaceId, target.sessionId]))
    .digest("hex");
}
function decodeState(value: unknown): SavedState {
  if (!value || typeof value !== "object") throw new Error("E_STATE_INVALID");
  const s = value as Partial<SavedState>;
  if (s.version !== 1 || !s.bindings || typeof s.bindings !== "object" || Array.isArray(s.bindings))
    throw new Error("E_STATE_INVALID");
  for (const [key, b] of Object.entries(s.bindings)) {
    if (
      !b ||
      !b.target ||
      typeof b.target.workspaceId !== "string" ||
      typeof b.target.sessionId !== "string" ||
      stateKey(b.target) !== key ||
      typeof b.enabled !== "boolean" ||
      typeof b.busy !== "boolean" ||
      !b.binding ||
      !/^\d{1,30}$/.test(b.binding.conversationId) ||
      typeof b.binding.title !== "string" ||
      typeof b.binding.downloadDirectory !== "string" ||
      !Array.isArray(b.messages) ||
      (b.archivedMessages !== undefined &&
        (!Array.isArray(b.archivedMessages) ||
          b.archivedMessages.some(
            (m: DoubaoAppMessage) =>
              !m || (m.role !== "user" && m.role !== "assistant") || typeof m.text !== "string",
          ))) ||
      !Array.isArray(b.videos) ||
      b.messages.some(
        (m: DoubaoAppMessage) =>
          !m || (m.role !== "user" && m.role !== "assistant") || typeof m.text !== "string",
      ) ||
      b.videos.some(
        (v: import("../../contracts/doubao-app").DoubaoAppVideo) =>
          !v ||
          typeof v.id !== "string" ||
          typeof v.name !== "string" ||
          typeof v.path !== "string" ||
          !/^[a-f0-9]{64}$/.test(v.sha256) ||
          !Number.isFinite(v.bytes) ||
          !Number.isFinite(v.durationMs),
      )
    )
      throw new Error("E_STATE_INVALID");
  }
  return s as SavedState;
}

/** Sole owner of durable App bindings and mirrored evidence; service only uses bounded operations. */
export class DoubaoAppBindingStore {
  private state: SavedState | undefined;
  private readonly file: string;
  constructor(userDataDir: string) {
    this.file = path.join(userDataDir, "doubao-app.json");
  }
  private async load(): Promise<SavedState> {
    if (this.state) return this.state;
    const read = await readJsonWithBackup(this.file);
    if (this.state) return this.state;
    if (read.corrupted && !read.recovered) throw new Error("E_STATE_INVALID");
    this.state = read.value === undefined ? { version: 1, bindings: {} } : decodeState(read.value);
    return this.state;
  }
  async get(target: SessionRef): Promise<SavedBinding | undefined> {
    return structuredClone((await this.load()).bindings[stateKey(target)]);
  }
  async entries(): Promise<readonly SavedBinding[]> {
    return structuredClone(Object.values((await this.load()).bindings));
  }
  async put(binding: SavedBinding): Promise<void> {
    const state = await this.load();
    const key = stateKey(binding.target);
    if (JSON.stringify(state.bindings[key]) === JSON.stringify(binding)) return;
    const next: SavedState = {
      version: 1,
      bindings: { ...state.bindings, [key]: structuredClone(binding) },
    };
    decodeState(next);
    await writeFileAtomicQueued(this.file, JSON.stringify(next, null, 2) + "\n", decodeState);
    this.state = next;
  }
}
