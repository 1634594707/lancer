import { decodeLancerModule } from "../../../../contracts/lancer-modules";
import { useCallback, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import type { TimelineViewport } from "../hooks/use-timeline-viewport";
import type { useThreadSearch } from "../hooks/use-thread-search";
import { ThreadSearchBar } from "../thread-search";
import type { TrajectoryNode } from "../session-trajectory/trajectory-model";
import { LancerProcessSurface } from "./process-surface";
import { buildLiveProcessData, type LiveProcessInput } from "./live-model";
import { ParallelTasks } from "./parallel-tasks";
import { ModuleWorkflow } from "./module-workflow";
import { useLiveEmissions } from "./live-emissions";
import type { ThreadMenuState } from "../../threads/hooks/use-thread-actions";
import { SidePanelIcon } from "../../../ui/icons";
import { ProcessSidebar } from "./shell-sidebar";
import type { ProcessSurfaceActions } from "./process-types";
import "./process-live.css";
import "./relay-tree.css";

export function LancerLiveSurface({
  input,
  viewport,
  conversation,
  composer,
  toolPanel,
  layoutStyle,
  modelReel,
  headerActions,
  threadMenu,
  threadShortcutOrderRef,
  highlightedId,
  onSelectNode,
  onSelectThread,
  onNewThread,
  onSelectAssistant,
  onOpenTools,
  onTogglePanel,
  threadSearch,
  loading,
  failure,
  onRetry,
}: {
  readonly input: LiveProcessInput;
  readonly viewport: TimelineViewport;
  readonly conversation?: ReactNode;
  readonly composer: ReactNode;
  readonly toolPanel?: ReactNode;
  readonly layoutStyle?: CSSProperties;
  readonly modelReel?: ReactNode;
  readonly headerActions: ReactNode;
  readonly threadMenu: ThreadMenuState;
  readonly threadShortcutOrderRef: import("react").RefObject<
    readonly import("../../threads/thread-groups").ThreadListEntry[] | null
  >;
  readonly highlightedId: string | null;
  readonly onSelectNode: (node: TrajectoryNode) => void;
  readonly onSelectThread: (target: { workspaceId: string; sessionId: string }) => void;
  readonly onNewThread: (zone?: string) => void;
  readonly onSelectAssistant: (id: string) => void;
  readonly onOpenTools: () => void;
  readonly onTogglePanel: () => void;
  readonly threadSearch: ReturnType<typeof useThreadSearch>;
  readonly loading: boolean;
  readonly failure: boolean;
  readonly onRetry: () => void;
}) {
  const { data, lane } = useMemo(() => buildLiveProcessData(input), [input]);
  const emission = useLiveEmissions(
    data.events,
    `${input.selectedSessionId}:${input.videoLearn?.videoId ?? ""}`,
    loading || input.trajectory.loading,
  );
  const [global, setGlobal] = useState(false);
  const [openBySession, setOpenBySession] = useState<Record<string, ReadonlySet<string>>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const owner = useRef<TimelineViewport | null>(null);
  const onViewport = useCallback((next: TimelineViewport) => {
    owner.current = next;
  }, []);
  const key = input.selectedSessionId;
  const open = openBySession[key] ?? new Set<string>();
  const nativeHighlight = data.events.find(
    (event) =>
      event.nativeNode?.id === highlightedId || event.nativeNode?.scrollTargetId === highlightedId,
  );
  const actions: ProcessSurfaceActions = {
    workspaceId: input.workspaceId,
    onReorderPinnedSessions: async (ids) => {
      const api = window.piApp;
      if (!api) throw new Error("Desktop bridge unavailable");
      const state = await api.getState();
      const visible = new Set(ids);
      let index = 0;
      const order = state.pinnedSessionOrder.map((id) => (visible.has(id) ? ids[index++]! : id));
      const next = await api.reorderPinnedSessions(order);
      if (next.lastError) throw new Error(next.lastError);
    },
    onSelectAssistant,
    onRenameSession: async (id, title) => {
      const entry = input.threads.find((t) => `${t.workspaceId}:${t.session.id}` === id);
      if (!entry || !window.piApp) throw new Error("会话已不存在。");
      const state = await window.piApp.renameSession(
        { workspaceId: entry.workspaceId, sessionId: entry.session.id },
        title,
      );
      if (state.lastError) throw new Error(state.lastError);
    },
    onArchiveSession: async (id, restore) => {
      const api = window.piApp;
      if (!api) throw new Error("Desktop bridge unavailable");
      const thread = input.threads.find(
        (thread) => `${thread.workspaceId}:${thread.session.id}` === id,
      );
      const target = thread
        ? { workspaceId: thread.workspaceId, sessionId: thread.session.id }
        : input.archivedSessions?.find((session) => session.id === id);
      if (!target) throw new Error("会话已不存在。");
      const state = await (restore ? api.unarchiveSession(target) : api.archiveSession(target));
      if (state.lastError) throw new Error(state.lastError);
    },
    onAssistantAction: async (action) => {
      if (!window.piApp) throw new Error("Desktop bridge unavailable");
      const state = await window.piApp.lancerAction(action);
      if (action.kind === "save-module" || action.kind === "delete-module") {
        const id = action.kind === "save-module" ? action.module.id : action.id;
        const saved = state.assistants?.modules?.find((module) => module.id === id);
        const applied =
          action.kind === "delete-module"
            ? saved?.deleted
            : saved &&
              JSON.stringify(decodeLancerModule(saved)) ===
                JSON.stringify(decodeLancerModule(action.module));
        if (!applied) throw new Error(state.lastError ?? "模块保存失败，请重试。");
        return;
      }
      if (state.lastError) throw new Error(state.lastError);
      if (action.kind === "create-conversation")
        onSelectThread({
          workspaceId: state.selectedWorkspaceId,
          sessionId: state.selectedSessionId,
        });
    },
    onToggle: (id) => {
      setOpenBySession((current) => {
        const next = new Set(current[key] ?? []);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ...current, [key]: next };
      });
      const event = data.events.find((event) =>
        data.messages[event.lane]?.find(
          (message) => message.id === id && message.eventId === event.id,
        ),
      );
      if (event?.nativeNode) {
        setSelected(event.id);
        onSelectNode(event.nativeNode);
      }
    },
    onToggleAll:
      lane === "all"
        ? () => {
            setOpenBySession((current) => ({
              ...current,
              [key]:
                (current[key]?.size ?? 0) > 0
                  ? new Set()
                  : new Set(
                      Object.values(data.messages).flatMap((messages) =>
                        messages.map((message) => message.id),
                      ),
                    ),
            }));
          }
        : undefined,
    onSelectLane: (next) => {
      if (next === "all") {
        setGlobal(true);
        return;
      }
      setGlobal(false);
      const target = input.trajectory.lanes.find((target) => target.id === next);
      if (target) onSelectThread(target);
      else {
        const group = data.sidebar.find(
          (group) => group.name === data.lanes.find((lane) => lane.id === next)?.name,
        );
        const session = group?.sessions[0];
        const thread = input.threads.find(
          (thread) => `${thread.workspaceId}:${thread.session.id}` === session?.id,
        );
        if (thread)
          onSelectThread({ workspaceId: thread.workspaceId, sessionId: thread.session.id });
      }
    },
    onSelectEvent: (id, hover) => {
      if (hover) {
        setHovered(id || null);
        return;
      }
      const event = data.events.find((event) => event.id === id);
      if (!event) return;
      setSelected(id);
      if (event.errorCode === "TREE_LOAD" || event.lane !== lane) {
        const target = input.trajectory.lanes.find((item) => item.id === event.lane);
        if (target) onSelectThread(target);
        return;
      }
      const message = data.messages[event.lane]?.find((message) => message.eventId === id);
      if (message)
        setOpenBySession((current) => ({
          ...current,
          [key]: new Set([...(current[key] ?? []), message.id]),
        }));
      if (global || lane === "all")
        requestAnimationFrame(() =>
          owner.current?.navigateToRow(message?.anchorId ?? message?.id ?? id),
        );
      else if (event.nativeNode) onSelectNode(event.nativeNode);
    },
    onSelectSession: (id) => {
      const target = input.threads.find(
        (thread) => `${thread.workspaceId}:${thread.session.id}` === id,
      );
      if (target) onSelectThread({ workspaceId: target.workspaceId, sessionId: target.session.id });
    },
    onNewThread,
    onOpenTools,
    onToggleMaximize: () => {
      window.piApp
        ?.toggleWindowMaximize()
        .catch((error: unknown) => console.error("[renderer] maximize failed", error));
    },
  };
  return (
    <LancerProcessSurface
      data={data}
      currentLane={lane}
      emissions
      state={{
        time: data.timelineEnd ?? 26.5,
        flightTimes: emission.times,
        flightSampledAt: emission.sampledAt,
        flightSeeds: emission.seeds,
        lane: global ? "all" : lane,
        focus: "",
        open,
        highlighted: nativeHighlight?.id ?? selected,
        hovered,
        currentActor: "selected-model",
      }}
      actions={actions}
      viewport={viewport}
      onViewport={onViewport}
      sessionKey={key}
      conversation={lane === "all" ? undefined : conversation}
      conversationHeader={
        <>
          <ModuleWorkflow input={input} />
          {input.trajectory.error ? (
            <div className="conversation-tree-error" role="status">
              <span>这个会话的历史树暂时无法读取。</span>
              <button type="button" onClick={input.trajectory.reload}>
                重新读取
              </button>
              <details>
                <summary>查看原因</summary>
                <p>{input.trajectory.error}</p>
              </details>
            </div>
          ) : null}
        </>
      }
      composer={
        <>
          <ParallelTasks input={input} onSelectThread={onSelectThread} />
          {composer}
        </>
      }
      toolPanel={toolPanel}
      sidebar={
        <ProcessSidebar
          actions={actions}
          threadMenu={threadMenu}
          threads={input.threads}
          threadShortcutOrderRef={threadShortcutOrderRef}
        />
      }
      layoutStyle={layoutStyle}
      modelReel={modelReel}
      headerActions={
        <>
          {headerActions}
          <button
            type="button"
            data-testid="toggle-side-panel"
            aria-label="Toggle side panel"
            aria-pressed={Boolean(toolPanel)}
            onClick={onTogglePanel}
          >
            <SidePanelIcon />
          </button>
        </>
      }
      search={
        threadSearch.isOpen ? (
          <ThreadSearchBar
            query={threadSearch.query}
            matchCount={threadSearch.matchCount}
            activeIndex={threadSearch.activeIndex}
            inputRef={threadSearch.inputRef}
            onSearch={threadSearch.search}
            onNext={() => threadSearch.goToMatch(1)}
            onPrev={() => threadSearch.goToMatch(-1)}
            onClose={threadSearch.close}
          />
        ) : null
      }
      loading={loading}
      failure={failure}
      onRetry={onRetry}
    />
  );
}
