import { basename } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  launchDesktop,
  openNewThread,
  createNamedThread,
  makeUserDataDir,
  makeWorkspace,
  reloadDesktopRenderer,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("new conversations explicitly choose their workspace while keeping the module sidebar", async () => {
  const userDataDir = await makeUserDataDir();
  const workspaceA = await makeWorkspace("sidebar-new-thread-a");
  const workspaceB = await makeWorkspace("sidebar-new-thread-b");
  const harness = await launchDesktop(userDataDir, { initialWorkspaces: [workspaceA, workspaceB] });
  try {
    const window = await harness.firstWindow();
    for (const workspacePath of [workspaceB, workspaceA]) {
      const workspace = await waitForWorkspaceByPath(window, workspacePath);
      await openNewThread(window);
      await window
        .getByRole("combobox", { name: "Workspace", exact: true })
        .selectOption(workspace.id);
      await expect(window.getByRole("combobox", { name: "Workspace", exact: true })).toHaveValue(
        workspace.id,
      );
      await expect(window.getByRole("navigation", { name: "模块", exact: true })).toBeVisible();
      await createNamedThread(window, `Conversation in ${basename(workspacePath)}`, {
        workspaceName: basename(workspacePath),
      });
    }
  } finally {
    await harness.close();
  }
});

test("the sidebar can be dragged wider, remembers its width and resets on double-click", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const workspace = await makeWorkspace("sidebar-width");
  const sidebarWidth = async (window: Page) =>
    Math.round((await window.locator("aside.shell-sidebar").boundingBox())?.width ?? 0);

  let defaultWidth = 0;
  let harness = await launchDesktop(userDataDir, { initialWorkspaces: [workspace] });
  try {
    const window = await harness.firstWindow();
    await window.addInitScript(() => {
      const NativeObserver = ResizeObserver;
      window.ResizeObserver = class extends NativeObserver {
        constructor(callback: ResizeObserverCallback) {
          super((entries, observer) => {
            const paused = (window as Window & { pausePaneObservation?: boolean })
              .pausePaneObservation;
            if (paused && entries.some((entry) => entry.target.matches("aside.shell-sidebar")))
              return;
            callback(entries, observer);
          });
        }
      };
    });
    await reloadDesktopRenderer(window);
    await waitForWorkspaceByPath(window, workspace);
    await expect(window.locator("aside.shell-sidebar")).toBeVisible();
    defaultWidth = await sidebarWidth(window);

    const handle = window.getByRole("separator", { name: "Sidebar width" });
    const start = (await handle.boundingBox())!;
    await window.mouse.move(start.x + 3, start.y + 200);
    await window.mouse.down();
    await window.mouse.move(start.x + 103, start.y + 200, { steps: 10 });
    await window.mouse.up();
    await expect.poll(() => sidebarWidth(window)).toBe(defaultWidth + 100);

    // Hiding the sidebar right after a drag still keeps the new width.
    await window.getByTestId("sidebar-toggle").click();
    await expect(window.locator("aside.shell-sidebar")).toBeHidden();
    await window.getByTestId("sidebar-toggle").click();
    await expect.poll(() => sidebarWidth(window)).toBe(defaultWidth + 100);

    // Dragging far past the limit stops at the maximum instead of swallowing the window.
    const widened = (await handle.boundingBox())!;
    await window.mouse.move(widened.x + 3, widened.y + 200);
    await window.mouse.down();
    await window.mouse.move(widened.x + 2000, widened.y + 200, { steps: 10 });
    await window.mouse.up();
    const max = Number(await handle.getAttribute("aria-valuemax"));
    expect(max).toBeGreaterThan(defaultWidth + 100);
    await expect.poll(() => sidebarWidth(window)).toBe(max);

    // ResizeObserver delivery can lag behind a visible DOM resize. Keyboard
    // steps must use the current pane width, even while that observation is stale.
    await expect(handle).toHaveAttribute("aria-valuenow", String(max));
    await window.evaluate(() => {
      (window as Window & { pausePaneObservation?: boolean }).pausePaneObservation = true;
    });
    await handle.focus();
    await window.keyboard.press("Home");
    await expect.poll(() => sidebarWidth(window)).toBe(200);
    await window.keyboard.press("ArrowRight");
    await expect.poll(() => sidebarWidth(window)).toBe(220);
  } finally {
    await harness.close();
  }

  harness = await launchDesktop(userDataDir, { initialWorkspaces: [workspace] });
  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspace);
    await expect.poll(() => sidebarWidth(window)).toBe(220);

    await window.getByRole("separator", { name: "Sidebar width" }).dblclick();
    await expect.poll(() => sidebarWidth(window)).toBe(defaultWidth);
  } finally {
    await harness.close();
  }
});
