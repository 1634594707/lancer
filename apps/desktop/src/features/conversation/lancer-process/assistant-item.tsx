import { useEffect, useId, useRef, type CSSProperties } from "react";
import type { LancerAssistant } from "../../../../contracts/lancer-assistants";
import { ShellAssistantAvatar } from "./assistant-avatar";
import "./assistant-menu.css";

export function AssistantItem({
  profile,
  active,
  canDelete,
  onSelect,
  onEdit,
}: {
  readonly profile: LancerAssistant;
  readonly active: boolean;
  readonly canDelete: boolean;
  readonly onSelect: () => void;
  readonly onEdit: (mode: "edit" | "rename" | "delete") => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const anchor = `--assistant-${useId().replaceAll(":", "")}`;
  const pending = useRef<HTMLButtonElement | null>(null);
  const source = useRef<HTMLButtonElement | null>(null);
  const close = () => {
    source.current?.focus({ preventScroll: true });
    menu.current?.hidePopover();
  };
  const open = (target: HTMLButtonElement) => {
    source.current = target;
    target.focus({ preventScroll: true });
    menu.current?.showPopover();
  };
  useEffect(() => {
    const dismiss = (event: FocusEvent) => {
      if (
        menu.current?.matches(":popover-open") &&
        event.target instanceof Node &&
        !menu.current.contains(event.target) &&
        event.target !== source.current
      ) {
        menu.current.hidePopover();
      }
    };
    let frame = 0;
    const release = () => {
      const target = pending.current;
      pending.current = null;
      if (target) frame = requestAnimationFrame(() => open(target));
    };
    document.addEventListener("pointerup", release);
    document.addEventListener("focusin", dismiss);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("focusin", dismiss);
    };
  }, []);
  return (
    <div
      className="assistant-item"
      style={{ "--assistant-menu-anchor": anchor } as CSSProperties}
      onContextMenu={(event) => {
        const target = event.target instanceof Element ? event.target.closest("button") : null;
        if (!(target instanceof HTMLButtonElement) || menu.current?.contains(target)) return;
        event.preventDefault();
        event.stopPropagation();
        // Chromium light-dismiss processes the right-button release after contextmenu.
        if (event.buttons) pending.current = target;
        else open(target);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
        if (!(event.target instanceof HTMLButtonElement)) return;
        event.preventDefault();
        open(event.target);
      }}
    >
      <button
        type="button"
        className="shell-sidebar__pin"
        aria-label={`选择助手：${profile.name}`}
        aria-pressed={active}
        onClick={onSelect}
      >
        <ShellAssistantAvatar identity={profile.id} avatar={profile.avatar} />
      </button>
      <button
        type="button"
        className="assistant-name"
        aria-label={`编辑助手：${profile.name}`}
        title="改名、头像与删除"
        onClick={() => onEdit("edit")}
      >
        {profile.name}
      </button>
      <div
        ref={menu}
        popover="auto"
        className="assistant-context-menu"
        onToggle={(event) => {
          if (event.newState !== "open") return;
          const element = event.currentTarget;
          if (!CSS.supports("position-area", "block-end")) {
            const anchor = source.current!.getBoundingClientRect();
            element.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - element.offsetWidth - 8))}px`;
            element.style.top = `${Math.max(8, Math.min(anchor.bottom, innerHeight - element.offsetHeight - 8))}px`;
          }
          element.querySelector<HTMLButtonElement>("button")?.focus();
        }}
      >
        <div
          role="menu"
          aria-label={`${profile.name}的助手操作`}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Tab") {
              if (event.key === "Escape") event.preventDefault();
              event.stopPropagation();
              close();
              return;
            }
            if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
            );
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
            event.preventDefault();
            items[next]?.focus();
          }}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              close();
              onEdit("rename");
            }}
          >
            重命名
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={!canDelete}
            title={!canDelete ? "至少保留一个 AI 助手" : undefined}
            onClick={() => {
              close();
              onEdit("delete");
            }}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
