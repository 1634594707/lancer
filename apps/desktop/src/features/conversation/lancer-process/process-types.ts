import type { CSSProperties, ReactNode } from "react";
import type { TrajectoryNode } from "../session-trajectory/trajectory-model";

export type ProcessEventKind =
  | "start"
  | "commit"
  | "handoff"
  | "checkpoint"
  | "test"
  | "review"
  | "fork"
  | "merge"
  | "artifact"
  | "tool"
  | "switch"
  | "compact"
  | "wait"
  | "xref"
  | "error"
  | "retry";
export interface ProcessActor {
  readonly id: string;
  readonly name: string;
  readonly short?: string;
  readonly badge?: string;
  readonly icon: string;
}
export interface ProcessIcon {
  readonly attributes: Readonly<Record<string, string>>;
  readonly parts: readonly {
    readonly tag: string;
    readonly attributes: Readonly<Record<string, string>>;
  }[];
}
export interface ProcessLane {
  readonly treeError?: string;
  readonly parentLaneId?: string;
  /** False for a configured task group without a real session yet. */
  readonly available?: boolean;
  readonly id: string;
  readonly name: string;
  readonly title?: string;
  readonly statusLabel?: string;
  readonly color: string;
  readonly relay: readonly string[];
}
export interface ProcessSidebarGroup {
  readonly id?: string;
  readonly name: string;
  readonly count: string;
  readonly sessions: readonly {
    readonly id: string;
    readonly sessionId?: string;
    readonly pinned?: boolean;
    readonly actor: string;
    readonly title: string;
    readonly branch: string;
    readonly status: string;
    readonly treeError?: string;
    readonly hasUnseenUpdate?: boolean;
    readonly selected?: boolean;
  }[];
}
export interface ProcessEvent {
  readonly modelFamily?: string;
  readonly id: string;
  readonly index: number;
  readonly time: number;
  readonly row?: number;
  readonly lane: string;
  readonly kind: ProcessEventKind;
  readonly actor: string;
  readonly label: string;
  readonly summary: string;
  readonly branch?: boolean;
  readonly branchId?: string;
  readonly emits?: boolean;
  readonly running?: boolean;
  readonly fail?: boolean;
  readonly targetActor?: string;
  readonly retryTarget?: string;
  readonly reference?: string;
  readonly waitDuration?: number;
  readonly hash?: string;
  readonly artifacts?: readonly import("../../../../contracts/relay-tree").RelayArtifact[];
  readonly unverified?: boolean;
  readonly artifactPath?: string;
  readonly sha256?: string;
  readonly statusCode?: string;
  readonly runId?: string;
  readonly errorCode?: string;
  readonly nativeNode?: TrajectoryNode;
  readonly evidenceTimestamp?: string;
  readonly evidenceModel?: string;
}
export interface ProcessStepData {
  readonly id: string;
  readonly kind: "think" | "run" | "read" | "search" | "edit";
  readonly label: string;
  readonly duration: string;
  readonly detail: string;
  readonly nativeBody?: ReactNode;
}
export interface ProcessMessage {
  readonly id: string;
  readonly anchorId?: string;
  readonly timestampLabel?: string;
  readonly kind: "user" | "assistant" | "event";
  readonly time: number;
  readonly eventId?: string;
  readonly actor?: string;
  readonly text?: string;
  readonly completed?: boolean;
  readonly running?: boolean;
  readonly replies?: readonly (readonly [string, string])[];
  readonly steps?: readonly ProcessStepData[];
  readonly card?: string;
  readonly nativeBody?: ReactNode;
}
export interface ArchivedConversation {
  readonly id: string;
  readonly title: string;
  readonly workspaceId: string;
  readonly sessionId: string;
}
export interface ProcessFixture {
  readonly centeredTree?: boolean;
  readonly archivedSessions?: readonly ArchivedConversation[];
  readonly assistants?: import("../../../../contracts/lancer-assistants").LancerAssistantsState;
  readonly assistantId?: string;
  readonly sidebarCollapsed?: boolean;
  readonly videoDeliverables?: readonly import("./video-deliverables").VideoDeliverable[];
  readonly laneSummary?: string;
  readonly minimumGraphHeight?: number;
  readonly timelineEnd?: number;
  readonly nodeLabels?: boolean;
  readonly clockLabel?: string;
  readonly statusLabel?: string;
  readonly recentActors?: readonly string[];
  readonly actors: readonly ProcessActor[];
  readonly icons: Readonly<Record<string, ProcessIcon>>;
  readonly lanes: readonly ProcessLane[];
  readonly sidebar: readonly ProcessSidebarGroup[];
  readonly reel: readonly string[];
  readonly events: readonly ProcessEvent[];
  /** Full conversation history when the tree is a condensed overview. */
  readonly conversationEvents?: readonly ProcessEvent[];
  readonly messages: Readonly<Record<string, readonly ProcessMessage[]>>;
  readonly titles: Readonly<Record<string, { readonly title: string; readonly branch: string }>>;
}
export interface ProcessViewState {
  readonly flightSeeds?: Readonly<Record<string, number>>;
  readonly time: number;
  /** Live-only event clocks. Empty means do not replay historical flights. */
  readonly flightSampledAt?: number;
  readonly flightTimes?: Readonly<Record<string, number>>;
  readonly lane: string;
  readonly focus: string;
  readonly highlighted: string | null;
  readonly hovered?: string | null;
  readonly traceSelection?: boolean;
  readonly open: ReadonlySet<string>;
  readonly reelPosition?: number;
  readonly currentActor?: string;
}
export interface ProcessSurfaceActions {
  readonly onReorderPinnedSessions?: (ids: readonly string[]) => Promise<void>;
  readonly onArchiveSession?: (id: string, restore?: boolean) => Promise<void>;
  readonly onSelectAssistant?: (id: string) => void;
  readonly onRenameSession?: (id: string, title: string) => Promise<void>;
  readonly onAssistantAction?: (
    action: import("../../../../contracts/lancer-assistants").LancerAction,
  ) => Promise<void>;
  readonly workspaceId?: string;
  readonly onToggle: (id: string) => void;
  readonly onToggleAll?: () => void;
  readonly onSelectLane: (lane: string) => void;
  readonly onSelectEvent: (id: string, hover?: boolean) => void;
  readonly onSelectSession: (id: string) => void;
  readonly onLaunch?: () => void;
  readonly onNewThread?: (zone?: string) => void;
  readonly onOpenTools?: () => void;
  readonly onToggleMaximize?: () => void;
  readonly onSelectModel?: (actor: string) => void;
}
export const laneStyle = (color: string): CSSProperties =>
  ({ "--lc": color, "--cc": color }) as CSSProperties;
