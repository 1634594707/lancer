/** Browser-safe status for the in-app Douyin download → watch process. */

export const VIDEO_LEARN_PROCESS_ID = "lancer.video_learn_remake.v1" as const;

export type VideoLearnGuiStatus =
  | "PENDING_DOWNLOAD"
  | "READY_HASH_OK"
  | "MEDIA_READY"
  | "ANALYZED"
  | "RUNNING"
  | "HANDED_OFF"
  | "LEARNED"
  | "REMAKE_SKIPPED"
  | "FAILED";

export interface VideoLearnStage {
  readonly running?: boolean;
  readonly model?: string;
  readonly id: "ingest" | "download" | "media" | "analysis" | "handoff" | "watch" | "remake";
  readonly actor: "human" | "local" | "gateway" | "doubao" | "codex";
  readonly statusCode: string;
  readonly guiLabel: string;
  readonly ok: boolean;
}

/** Short mechanical handoff. Paths are relative to the shared project root. */
export interface VideoLearnHandoff {
  readonly videoId: string;
  readonly statusCode: "download.ok";
  readonly sha256: string;
  readonly manifest: string;
  readonly source: string;
  readonly fromActor: "doubao" | "local";
  readonly toActor: "codex" | "gateway";
}

export interface VideoLearnSessionRef {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly role: "download" | "watch";
}

export interface VideoLearnSnapshot {
  readonly operations?: readonly VideoLearnOperation[];
  readonly relayTree?: import("./relay-tree").RelayTreeEvidence;
  readonly busy?: boolean;
  readonly sourceSha256?: string;
  readonly lessons?: readonly {
    readonly lesson: string;
    readonly frame_index: number;
    readonly pts_ms: number;
  }[];
  readonly processId: typeof VIDEO_LEARN_PROCESS_ID;
  readonly projectRoot: string;
  readonly videoId: string;
  readonly douyinUrl: string;
  readonly guiStatus: VideoLearnGuiStatus;
  readonly stages: readonly VideoLearnStage[];
  readonly handoff: VideoLearnHandoff | null;
  readonly errorCode: string | null;
  readonly sessions: readonly VideoLearnSessionRef[];
  readonly sessionError: string | null;
}

/** Bounded local media execution record; absent for runs predating recording. */
export interface VideoLearnOperation {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly status: "running" | "success" | "error";
  readonly output?: string;
  readonly durationMs?: number;
  readonly error?: string;
}

export interface VideoLearnRunInput {
  readonly sessionId?: string;
  readonly workspaceId: string;
  readonly url?: string;
  readonly received?: { readonly sessionId: string; readonly videoId: string };
  readonly cookiesPath?: string;
}

export interface VideoLearnStatusInput {
  readonly workspaceId: string;
  readonly videoId?: string;
}

export function videoLearnErrorMessage(code: string | null | undefined): string {
  const messages: Record<string, string> = {
    E_MODEL_CONFIG: "请选择已连接的视觉模型，或在视频设置文件中配置模型。",
    E_MODEL_FAIL: "模型未完成有效分析，请检查连接和模型能力后重试。",
    E_MODEL_BAD_REF: "分析引用与视频快照不一致，本次结果未通过校验。",
    E_PROBE_MISSING: "缺少视频工具，请运行 pnpm doctor --media 检查安装。",
    E_PROBE_FAIL: "视频工具运行失败，请检查 FFmpeg、FFprobe 是否可正常启动。",
    E_NOT_VIDEO: "未取得有效视频，请检查链接或已接收文件。",
    E_TIMEOUT: "处理超时，已停止本次请求。",
    INVALID_URL: "请输入有效的抖音视频链接。",
  };
  return code ? (messages[code] ?? code) : "";
}
