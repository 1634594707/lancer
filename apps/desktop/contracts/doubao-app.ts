import type { SessionRef } from "@lancer/session-driver/types";

export interface DoubaoAppMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
}
export interface DoubaoAppVideo {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly durationMs: number;
}
export interface DoubaoAppSnapshot {
  readonly enabled: boolean;
  readonly binding: {
    readonly conversationId: string;
    readonly title: string;
    readonly downloadDirectory: string;
  } | null;
  readonly messages: readonly DoubaoAppMessage[];
  /** Original mirrors retained when native message parsing changes. */
  readonly archivedMessages?: readonly DoubaoAppMessage[];
  readonly videos: readonly DoubaoAppVideo[];
  readonly busy: boolean;
  readonly errorCode: string | null;
  readonly error: string | null;
}
export interface DoubaoAppBindInput {
  readonly target: SessionRef;
  readonly conversationId?: string;
}
export interface DoubaoAppSendInput {
  readonly target: SessionRef;
  readonly text: string;
  readonly download?: boolean;
}
export interface DoubaoAppEnabledInput {
  readonly target: SessionRef;
  readonly enabled: boolean;
}
export interface DoubaoAppOpenVideoInput {
  readonly target: SessionRef;
  readonly videoId: string;
}
