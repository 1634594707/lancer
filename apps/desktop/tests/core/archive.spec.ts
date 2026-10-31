import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
} from "../helpers/electron-app";

test("archives a hovered thread into a restorable sidebar section", async () => {
  const userDataDir = await makeUserDataDir("pi-app-user-data-");
  const workspacePath = await makeWorkspace("archive-sidebar-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Thread one");
    await createNamedThread(window, "Thread two");
    await expect(window.getByTestId("thread-title")).toHaveText("Thread two");

    const activeRow = window
      .locator(".lst > .session-row")
      .filter({ hasText: "Thread two" })
      .first();
    const archiveButton = activeRow.getByLabel("Archive Thread two");
    const preview = activeRow.locator(".shell-sidebar__preview");

    await expect(archiveButton).toBeVisible();
    await expect(preview).toBeVisible();

    await activeRow.hover();
    await expect(archiveButton).toHaveCSS("opacity", "1");
    await archiveButton.click();
    await expect(window.getByTestId("thread-title")).toHaveText("Thread one");
    const archivedGroup = window.locator(".archived-thread-group");
    const archivedToggle = archivedGroup.locator(".archived-thread-group__toggle");
    await expect(archivedGroup).toContainText("回收区");
    await expect(archivedToggle).toHaveAttribute("aria-expanded", "false");
    await expect(archivedGroup.locator(".session-row")).toHaveCount(0);

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        return (
          state.workspaces[0]?.sessions.find((session) => session.title === "Thread two")
            ?.archivedAt ?? ""
        );
      })
      .not.toBe("");

    await archivedToggle.click();
    await expect(archivedToggle).toHaveAttribute("aria-expanded", "true");
    await expect(archivedGroup.locator(".session-row")).toContainText("Thread two");

    const archivedRow = archivedGroup
      .locator(".session-row")
      .filter({ hasText: "Thread two" })
      .first();
    const restoreButton = archivedRow.getByLabel("Restore Thread two");
    await archivedRow.hover();
    await restoreButton.click();

    await expect(
      window.locator(".lst > .session-row").filter({ hasText: "Thread two" }),
    ).toHaveCount(1);
    await expect(window.locator(".archived-thread-group")).toHaveCount(0);

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        return (
          state.workspaces[0]?.sessions.find((session) => session.title === "Thread two")
            ?.archivedAt ?? ""
        );
      })
      .toBe("");
  } finally {
    await harness.close();
  }
});
