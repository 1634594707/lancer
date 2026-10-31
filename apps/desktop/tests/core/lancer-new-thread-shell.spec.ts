import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  clickSession,
  createNamedThread,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
} from "../helpers/electron-app";

test("new conversations keep the Lancer shell through navigation and restart", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("lancer-shell");
  await writeFile(
    join(userDataDir, "ui-state.json"),
    JSON.stringify({ themeMode: "light", language: "en" }),
  );
  const first = await launchDesktop(userDataDir, { initialWorkspaces: [workspacePath] });
  try {
    const page = await first.firstWindow();
    await openNewThread(page);
    await expect(page.getByTestId("lancer-process-surface")).toBeVisible();
    await expect(page.locator(".shell")).toHaveCount(0);
    await expect(page.getByTestId("new-thread-composer")).toBeFocused();
    // Seed an existing conversation without contacting a provider; navigation remains UI-driven.
    await createNamedThread(page, "Keep existing conversation");
    await page.getByTestId("composer").fill("Keep this unsent draft");
    await openNewThread(page);
    await expect(page.getByTestId("lancer-process-surface")).toBeVisible();
    await expect(page.getByTestId("session-trajectory-panel")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "模块" })).toBeVisible();
    await expect(page.locator(".shell-sidebar__residents img")).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "选择助手：Lancer", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".shell")).toHaveCount(0);
    await expect(page.getByTestId("new-thread-composer")).toHaveValue("");
    await page.getByTestId("new-thread-composer").fill("A separate new conversation");
    await page.screenshot({ path: test.info().outputPath("new-thread-lancer.png") });
    await clickSession(page, "Keep existing conversation");
    await expect(page.getByTestId("composer")).toHaveValue("Keep this unsent draft");
    await openNewThread(page);
    await expect.poll(async () => (await getDesktopState(page)).activeView).toBe("new-thread");
  } finally {
    await first.close();
  }
  const second = await launchDesktop(userDataDir);
  try {
    const page = await second.firstWindow();
    await expect(page.getByTestId("new-thread-composer")).toBeVisible();
    await expect(page.getByTestId("lancer-process-surface")).toBeVisible();
    await expect(page.locator(".shell")).toHaveCount(0);
    await clickSession(page, "Keep existing conversation");
    await expect(page.getByTestId("composer")).toHaveValue("Keep this unsent draft");
  } finally {
    await second.close();
  }
});
