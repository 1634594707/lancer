import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeUserDataDir,
  seedAgentDir,
  seedLancerScreenshotUiPrefs,
  selectSession,
  waitForSelectedSessionReady,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";
import { makeLancerScreenshotFixture } from "../helpers/lancer-screenshot-fixture";

test("module management, assistant actions and draft navigation retain the three-pane shell", async () => {
  test.setTimeout(90_000);
  const output = resolve(process.env.LANCER_SHELL_OUTPUT ?? test.info().outputPath("shell"));
  await mkdir(output, { recursive: true });
  const profile = await makeUserDataDir();
  await seedLancerScreenshotUiPrefs(profile);
  const agentDir = join(profile, "agent");
  // Synthetic local credentials enable the model chrome; this test sends no prompts.
  await seedAgentDir(agentDir, { withOpenAiAuth: true });
  const { fixture, workspacePath, initialWorkspaces } = await makeLancerScreenshotFixture(
    agentDir,
    profile,
  );
  const harness = await launchDesktop(profile, {
    agentDir,
    initialWorkspaces,
    scrubProviderEnv: true,
  });
  const appProcess = harness.electronApp.process();
  try {
    const page = await harness.firstWindow();
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
    );
    await waitForWorkspaceByPath(page, workspacePath);
    const modules = page.getByRole("navigation", { name: "模块" });
    // The process shell mounts only after a session is selected. The opened
    // workspace is sometimes a worktree with no session of its own.
    if (!(await modules.isVisible())) {
      await selectSession(page, fixture.title);
    }
    await modules.getByRole("button", { name: "Lancer 自举", exact: true }).click();
    await selectSession(page, fixture.title);
    await waitForSelectedSessionReady(page, fixture);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(modules.locator(".shell-sidebar__module-row")).toHaveCount(6);
    await expect(page.getByRole("button", { name: "新增模块", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "管理模块", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "搜索会话", exact: true })).toHaveCount(0);
    const residents = page.getByLabel("AI 助手", { exact: true });
    const residentButtons = residents.getByRole("button", { name: /^选择助手/ });
    await expect(residentButtons).toHaveCount(3);
    const portraits = residentButtons.locator(".shell-assistant-avatar");
    await expect(portraits).toHaveCount(3);
    const pin = residentButtons.first();
    await expect(pin).toHaveCSS("width", "48px");
    await expect(pin).toHaveCSS("height", "48px");
    const selectedPin = residents.getByRole("button", { pressed: true });
    await expect(selectedPin).toHaveCount(1);
    await expect(selectedPin).toHaveCSS("outline-style", "solid");
    const selectedPortrait = await selectedPin.locator("img").getAttribute("src");
    const rowPortraits = page.getByTestId("process-session-row").locator("img");
    await expect(rowPortraits.first()).toHaveAttribute("src", selectedPortrait!);
    await selectedPin.click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "重命名", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "删除", exact: true })).toBeEnabled();
    await page.keyboard.press("Escape");
    const tree = page.getByTestId("process-tree");
    const sidebarBox = (await page.locator(".shell-sidebar").boundingBox())!;
    const conversationBox = (await page.locator(".main").boundingBox())!;
    const treeBox = (await page.getByTestId("session-trajectory-panel").boundingBox())!;
    expect(conversationBox.x).toBeGreaterThanOrEqual(sidebarBox.x + sidebarBox.width);
    expect(treeBox.x).toBeGreaterThanOrEqual(conversationBox.x + conversationBox.width - 1);
    const composer = page.getByTestId("composer");
    await composer.fill("保留的未发送草稿");
    const video = fixture.siblingSessions[0]!;
    await modules.getByRole("button", { name: "视频复刻", exact: true }).click();
    await expect(page.getByTestId("process-session-row")).toHaveCount(4);
    await expect(composer).not.toHaveValue("保留的未发送草稿");
    await selectSession(page, fixture.title);
    await expect(composer).toHaveValue("保留的未发送草稿");
    // A real saved node routes to its conversation and module without losing the draft.
    await tree.locator(`[data-event-lane="lane:${video.sessionId}"]`).first().click();
    await waitForSelectedSessionReady(page, video);
    await expect(modules.getByRole("button", { name: "视频复刻", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await selectSession(page, fixture.title);
    await expect(composer).toHaveValue("保留的未发送草稿");
    await page.screenshot({ path: join(output, "shell-native.png") });
    await writeFile(
      join(output, "verification.json"),
      JSON.stringify(
        {
          proof: "fixture-backed visible Electron; no external provider requests",
          profile,
          pid: appProcess.pid,
          modules: 6,
          residents: 3,

          treeWidth: treeBox.width,
          search: "removed by product design",
          draftIsolation: "passed",
          treeNavigation: "passed",
        },
        null,
        2,
      ),
    );
  } finally {
    await harness.close();
    await writeFile(
      join(output, "cleanup.json"),
      JSON.stringify({ pid: appProcess.pid, exitCode: appProcess.exitCode }),
    );
  }
});
