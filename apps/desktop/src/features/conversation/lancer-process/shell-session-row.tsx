import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProcessFixture, ProcessSurfaceActions } from "./process-types";
import type { LancerAssistantsState } from "../../../../contracts/lancer-assistants";
import type { ThreadMenuState } from "../../threads/hooks/use-thread-actions";
import type { ThreadListEntry } from "../../threads/thread-groups";
import { ShellAssistantAvatar } from "./assistant-avatar";
import { PinIcon } from "../../../ui/icons";
import { SessionMenu } from "./session-menu";

export function ShellSessionRow({
  session,
  index,
  active,
  commandHeld,
  actions,
  threadMenu,
  threads,
  zone,
  onEdit,
  onError,
}: {
  readonly session: ProcessFixture["sidebar"][number]["sessions"][number];
  readonly index: number;
  readonly active?: LancerAssistantsState["profiles"][number];
  readonly commandHeld: boolean;
  readonly actions: ProcessSurfaceActions;
  readonly threadMenu?: ThreadMenuState;
  readonly threads: readonly ThreadListEntry[];
  readonly zone: string;
  readonly onEdit: (target: { id: string; title: string; zone: string }) => void;
  readonly onError: (error: string) => void;
}) {
  const canDrag = Boolean(session.pinned && actions.onReorderPinnedSessions);
  const sortable = useSortable({
    id: session.id,
    disabled: !canDrag,
  });
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        position: "relative",
        zIndex: sortable.isDragging ? 2 : undefined,
      }}
      className={`session-row ${session.selected ? "session-row--active" : ""}`}
      data-session-id={session.sessionId ?? session.id}
      data-thread-shortcut={commandHeld && index < 9 ? index + 1 : undefined}
      data-session-pinned={Boolean(session.pinned)}
      onContextMenu={(event) => {
        if (!threadMenu || !session.sessionId) return;
        event.preventDefault();
        threadMenu.openSidebarMenu(session.sessionId);
      }}
      onKeyDown={(event) => {
        if (
          !threadMenu ||
          !session.sessionId ||
          !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
        )
          return;
        event.preventDefault();
        threadMenu.openSidebarMenu(session.sessionId);
      }}
      data-sidebar-indicator={
        session.status === "run"
          ? "running"
          : session.status === "failed" || session.treeError
            ? "failed"
            : session.hasUnseenUpdate
              ? "unseen"
              : "none"
      }
    >
      <button
        {...(canDrag ? sortable.attributes : {})}
        {...(canDrag ? sortable.listeners : {})}
        type="button"
        className={`ssr session-row__select ${session.selected ? "on" : ""}`}
        data-testid="process-session-row"
        aria-current={session.selected ? "page" : undefined}
        onClick={() => {
          if (!sortable.isDragging) actions.onSelectSession(session.id);
        }}
      >
        <ShellAssistantAvatar identity={active?.id ?? session.actor} avatar={active?.avatar} />
        {commandHeld && index < 9 ? (
          <span className="shell-sidebar__shortcut" aria-hidden="true">
            {index + 1}
          </span>
        ) : null}
        <span className="shell-sidebar__session">
          <span className="t">
            {session.pinned ? (
              <span className="shell-sidebar__pinned" aria-label="已置顶">
                <PinIcon filled />
              </span>
            ) : null}
            {session.title}
          </span>
          <span className="shell-sidebar__preview">
            {session.treeError
              ? "历史读取失败"
              : session.status === "run"
                ? "运行中"
                : session.hasUnseenUpdate
                  ? "有新结果"
                  : "已保存"}{" "}
            · {session.branch}
          </span>
        </span>
      </button>
      <button
        className="session-row__archive"
        type="button"
        aria-label={`Archive ${session.title}`}
        title={session.status === "run" ? "先停止运行，再删除会话" : "删除会话（可从回收区恢复）"}
        disabled={session.status === "run"}
        onClick={() => {
          const action = actions.onArchiveSession;
          if (action) void action(session.id).catch((e) => onError(String(e)));
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
        </svg>
      </button>
      <button
        className="session-row__manage"
        type="button"
        aria-label={`管理会话：${session.title}`}
        title="改名与会话类型"
        onClick={() =>
          onEdit({
            id: session.id,
            title: session.title,
            zone: zone,
          })
        }
      >
        …
      </button>
      {threadMenu?.openMenu?.surface === "sidebar" &&
      threadMenu.openMenu.sessionId === session.sessionId &&
      threads.some((thread) => thread.session.id === session.sessionId) ? (
        <SessionMenu
          menu={threadMenu}
          thread={threads.find((thread) => thread.session.id === session.sessionId)!}
        />
      ) : null}
    </div>
  );
}
