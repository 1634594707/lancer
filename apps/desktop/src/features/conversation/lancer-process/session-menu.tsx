import { useLayoutEffect, useRef } from "react";
import type { ThreadListEntry } from "../../threads/thread-groups";
import type { ThreadMenuState } from "../../threads/hooks/use-thread-actions";
import { ThreadActionsMenu } from "../../threads/thread-actions";

/** Reuse the same actions as the titlebar and keyboard without clipping in the list. */
export function SessionMenu({
  thread,
  menu,
}: {
  readonly thread: ThreadListEntry;
  readonly menu: ThreadMenuState;
}) {
  const popover = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = popover.current;
    const row = element?.closest(".session-row");
    if (!element || !row) return;
    element.showPopover();
    const anchor = row.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, innerHeight - element.offsetHeight - 8))}px`;
    element.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => {
      if (element.contains(document.activeElement)) {
        row
          .querySelector<HTMLButtonElement>(".session-row__select")
          ?.focus({ preventScroll: true });
      }
    };
  }, []);
  return (
    <div ref={popover} popover="manual" className="lancer-session-menu">
      <div
        ref={menu.menuWrapRef}
        onKeyDown={(event) => {
          if (event.key === "Tab") menu.closeMenu();
          if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
          );
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
          event.preventDefault();
          buttons[next]?.focus();
        }}
      >
        <ThreadActionsMenu actions={menu.actionsFor(thread)} className="lancer-session-actions" />
      </div>
    </div>
  );
}
