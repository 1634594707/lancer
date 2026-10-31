import { mergeMessages } from "./message-merge";
export { mergeMessages } from "./message-merge";
import { realpath } from "node:fs/promises";
import path from "node:path";
import type { SessionRef } from "@lancer/session-driver/types";
import type {
  DoubaoAppBindInput,
  DoubaoAppSendInput,
  DoubaoAppSnapshot,
} from "../../contracts/doubao-app";
import { DoubaoAppBindingStore, stateKey, type SavedBinding } from "./binding-store";
import { VideoPassError } from "../video-learn/io";
import { type NativeDoubaoCall, type NativeDoubaoSnapshot } from "./native-client";
import { assertDownloadDirectory, createDownloadDirectory, DoubaoVideoReceiver } from "./videos";

export interface DoubaoAppServiceOptions {
  readonly userDataDir: string;
  readonly native: NativeDoubaoCall;
  readonly resolveWorkspace: (target: SessionRef) => string | undefined;
  readonly openVideo: (file: string) => Promise<void>;
  readonly platform?: string;
  readonly onVideoReceived?: (
    target: SessionRef,
    video: import("../../contracts/doubao-app").DoubaoAppVideo,
  ) => void;
}
const empty = (): DoubaoAppSnapshot => ({
  enabled: false,
  binding: null,
  messages: [],
  videos: [],
  busy: false,
  errorCode: null,
  error: null,
});
const errors: Record<string, string> = {
  E_APP_NOT_RUNNING: "请先打开豆包 App，并进入要关联的会话。",
  E_APP_WINDOW_MISSING: "豆包 App 没有可读取的会话窗口，请先打开会话。",
  E_AMBIGUOUS_WINDOW: "豆包有多个候选窗口，无法确认目标。请保留要使用的会话窗口后重试。",
  E_SESSION_NOT_VISIBLE: "在豆包侧栏未找到固定会话，请手动打开该会话后刷新。",
  E_SESSION_CHANGED: "豆包会话在操作中发生切换，已停止发送。",
  E_SELECT_FAILED: "无法切回固定会话，请在豆包 App 手动打开后刷新。",
  E_FOCUS_LOST: "发送时窗口焦点改变，已停止操作。请检查豆包输入框。",
  E_INPUT_MISSING: "无法识别豆包输入框，未发送消息。",
  E_INPUT_FAILED: "无法写入豆包输入框，请检查 App 状态。",
  E_UI_TOO_LARGE: "豆包界面内容过多，本次读取已停止。请收起侧边工作台后重试。",
  E_UI_UNSUPPORTED: "当前豆包界面结构无法可靠识别，已停止操作。",
  E_NOT_VIDEO: "收件目录中有文件未通过视频检查，未认定为下载成功。",
  E_PERMISSION: "请在 macOS 辅助功能中允许 Lancer 控制豆包 App。",
  E_CONVERSATION_MISMATCH: "豆包当前显示了其他会话。点击切回固定会话后再刷新。",
  E_NO_CONVERSATION: "请先在豆包 App 打开一个已有会话，再关联。",
  E_NOT_BOUND: "请先关联豆包 App 会话。",
  E_ALREADY_BOUND: "这个豆包会话已关联其他 Lancer 会话，不能重复绑定。",
  E_MESSAGE_TOO_LONG: "消息过长，请缩短后发送（最多 50 KB）。",
  E_BUSY: "豆包正在处理任务，请稍后再试。",
  E_APP_BUSY: "豆包正在处理任务，请稍后再试。",
  E_TIMEOUT: "读取豆包 App 超时，请稍后刷新。",
  E_DRAFT_PRESENT: "豆包输入框已有草稿，请先处理草稿。",
  E_SEND_UNCONFIRMED: "发送结果无法确认。请查看豆包会话，勿直接重复发送。",
  E_NATIVE_UNAVAILABLE: "豆包控制组件不可用，请检查安装。",
  E_NATIVE_TIMEOUT: "读取豆包 App 超时，请稍后刷新。",
  E_UNSUPPORTED: "豆包 App 连接目前仅支持 macOS。",
  E_DISABLED: "请先选择豆包 App。",
  E_DOWNLOAD_PATH: "下载目录不在当前工作区内，已停止读取。",
  E_REBIND: "已关联固定会话。为防止串话，请新建 Lancer 会话关联其他豆包会话。",
};

function syncTranscript(saved: SavedBinding | undefined, native: NativeDoubaoSnapshot) {
  if (native.transcriptVersion && !saved?.transcriptVersion) {
    // Keep the old mirror intact: it contains untyped transient snapshots that
    // cannot safely be distinguished from actual user prose after the fact.
    // Rebuild the visible mirror from the native completed-message surface.
    return {
      transcriptVersion: native.transcriptVersion,
      legacyMessages: saved?.messages ?? [],
      archivedMessages: saved?.messages ?? [],
      messages: native.messages,
    };
  }
  if (native.transcriptVersion === 3 && saved?.transcriptVersion === 2) {
    // v2 mixed UI dates into prose and omitted collapsed user bubbles. There is
    // no stable message ID to distinguish those duplicates from genuine repeats.
    // Retain the complete mirror separately instead of guessing which to delete.
    return {
      transcriptVersion: 3 as const,
      archivedMessages: [
        ...(saved.archivedMessages ?? saved.legacyMessages ?? []),
        ...saved.messages,
      ],
      messages: native.messages,
    };
  }
  return {
    messages: mergeMessages(saved?.messages ?? [], native.messages),
  };
}

export class DoubaoAppService {
  private readonly bindings: DoubaoAppBindingStore;
  private active = false;
  private readonly receiver: DoubaoVideoReceiver;
  constructor(private readonly options: DoubaoAppServiceOptions) {
    this.bindings = new DoubaoAppBindingStore(options.userDataDir);
    this.receiver = new DoubaoVideoReceiver(options.native);
  }
  private root(target: SessionRef): string {
    const root = this.options.resolveWorkspace(target);
    if (!root) throw new Error("E_UNKNOWN_SESSION");
    return path.resolve(root);
  }
  async status(target: SessionRef): Promise<DoubaoAppSnapshot> {
    this.root(target);
    return (await this.bindings.get(target)) ?? empty();
  }
  private async operation(
    target: SessionRef,
    action: () => Promise<DoubaoAppSnapshot>,
  ): Promise<DoubaoAppSnapshot> {
    if (this.active)
      return { ...(await this.status(target)), errorCode: "E_BUSY", error: errors.E_BUSY! };
    this.active = true;
    try {
      this.root(target);
      if ((this.options.platform ?? process.platform) !== "darwin")
        throw new Error("E_UNSUPPORTED");
      return await action();
    } catch (error) {
      const code =
        error instanceof VideoPassError
          ? error.code
          : error instanceof Error && /^E_[A-Z_]+$/.test(error.message)
            ? error.message
            : "E_DOUBAO";
      const previous = await this.status(target);
      const failed = {
        ...previous,
        errorCode: code,
        error: errors[code] ?? `豆包连接失败：${code}`,
      };
      const saved = await this.bindings.get(target);
      if (saved) {
        await this.bindings.put({ ...saved, ...failed });
      }
      return failed;
    } finally {
      this.active = false;
    }
  }
  private checkNative(snapshot: NativeDoubaoSnapshot, expected?: string): void {
    if (!snapshot.permission) throw new Error("E_PERMISSION");
    if (!snapshot.ok) throw new Error(snapshot.error ?? "E_NATIVE_RESPONSE");
    if (!snapshot.conversationId) throw new Error("E_NO_CONVERSATION");
    if (expected && snapshot.conversationId !== expected)
      throw new Error("E_CONVERSATION_MISMATCH");
  }
  async bind(input: DoubaoAppBindInput): Promise<DoubaoAppSnapshot> {
    return this.operation(input.target, async () => {
      const key = stateKey(input.target);
      const existing = await this.bindings.get(input.target);
      if (
        existing?.binding &&
        input.conversationId &&
        existing.binding.conversationId !== input.conversationId
      )
        throw new Error("E_REBIND");
      const native = await this.options.native(
        input.conversationId
          ? { action: "select", conversationId: input.conversationId }
          : { action: "snapshot" },
      );
      this.checkNative(native, input.conversationId);
      if (existing?.binding && existing.binding.conversationId !== native.conversationId)
        throw new Error("E_REBIND");
      if (
        (await this.bindings.entries()).some(
          (b) => stateKey(b.target) !== key && b.binding?.conversationId === native.conversationId,
        )
      )
        throw new Error("E_ALREADY_BOUND");
      const directory = await createDownloadDirectory(this.root(input.target), key);
      const result: SavedBinding = {
        ...empty(),
        ...existing,
        target: input.target,
        enabled: true,
        binding: {
          conversationId: native.conversationId!,
          title: native.title,
          downloadDirectory: directory,
        },
        ...syncTranscript(existing, native),
        busy: native.busy,
        error: null,
        errorCode: null,
      };
      await this.bindings.put(result);
      return result;
    });
  }
  async setEnabled(target: SessionRef, enabled: boolean): Promise<DoubaoAppSnapshot> {
    return this.operation(target, async () => {
      const s = await this.bindings.get(target);
      if (!s) throw new Error("E_NOT_BOUND");
      const result = { ...s, enabled };
      await this.bindings.put(result);
      return result;
    });
  }
  async refresh(target: SessionRef, select = false): Promise<DoubaoAppSnapshot> {
    return this.operation(target, async () => {
      const s = await this.bindings.get(target);
      if (!s?.binding) throw new Error("E_NOT_BOUND");
      const native = await this.options.native({
        action: select ? "select" : "snapshot",
        conversationId: s.binding.conversationId,
      });
      this.checkNative(native, s.binding.conversationId);
      const preserveSendError =
        s.errorCode?.startsWith("E_INPUT_") ||
        s.errorCode === "E_SEND_UNCONFIRMED" ||
        s.errorCode === "E_FOCUS_LOST" ||
        s.errorCode === "E_DRAFT_PRESENT";
      let result: SavedBinding = {
        ...s,
        binding: { ...s.binding, title: native.title },
        ...syncTranscript(s, native),
        busy: native.busy,
        error: preserveSendError ? s.error : null,
        errorCode: preserveSendError ? s.errorCode : null,
      };
      await this.bindings.put(result);
      if (!native.busy) {
        const directory = await this.checkedDirectory(target, s.binding.downloadDirectory);
        const videos = await this.receiver.receive(this.root(target), directory);
        result = { ...result, videos };
        await this.bindings.put(result);
        for (const video of videos) {
          if (!s.videos.some((old) => old.id === video.id))
            this.options.onVideoReceived?.(target, video);
        }
      }
      return result;
    });
  }
  async send(input: DoubaoAppSendInput): Promise<DoubaoAppSnapshot> {
    return this.operation(input.target, async () => {
      const s = await this.bindings.get(input.target);
      if (!s?.binding) throw new Error("E_NOT_BOUND");
      if (!s.enabled) throw new Error("E_DISABLED");
      const directory = await this.checkedDirectory(input.target, s.binding.downloadDirectory);
      const text = input.download
        ? `${input.text}\n\n请将本次视频实际下载到 ${directory} 。保留已有文件，使用新文件名。完成后返回真实文件路径；不能下载则明确说明。不要安装软件、修改系统设置或删除文件。`
        : input.text;
      if (Buffer.byteLength(text, "utf8") > 50_000) throw new Error("E_MESSAGE_TOO_LONG");
      const native = await this.options.native({
        action: "send",
        conversationId: s.binding.conversationId,
        text,
      });
      this.checkNative(native, s.binding.conversationId);
      if (!native.sent) throw new Error("E_SEND_UNCONFIRMED");
      const result = {
        ...s,
        ...syncTranscript(s, native),
        busy: true,
        error: null,
        errorCode: null,
      };
      await this.bindings.put(result);
      return result;
    });
  }
  private async checkedDirectory(target: SessionRef, directory: string): Promise<string> {
    const expected = path.join(
      await realpath(this.root(target)),
      ".lancer",
      "doubao",
      stateKey(target),
      "downloads",
    );
    if (expected !== directory) throw new Error("E_DOWNLOAD_PATH");
    return assertDownloadDirectory(this.root(target), directory);
  }
  async verifiedVideo(target: SessionRef, id: string) {
    const s = await this.status(target);
    const video = s.videos.find((v) => v.id === id);
    if (!s.binding || !video) throw new Error("E_VIDEO_NOT_FOUND");
    const directory = await this.checkedDirectory(target, s.binding.downloadDirectory);
    const verified = await this.receiver.verify(this.root(target), directory, video.name, true);
    if (
      !verified ||
      verified.id !== id ||
      verified.path !== video.path ||
      verified.sha256 !== video.sha256
    )
      throw new Error("E_VIDEO_CHANGED");
    return verified;
  }
  async openVideo(target: SessionRef, id: string): Promise<void> {
    const verified = await this.verifiedVideo(target, id);
    await this.options.openVideo(verified.path);
  }
}
