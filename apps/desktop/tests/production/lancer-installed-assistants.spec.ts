import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  getDesktopState,
  launchDesktopByExecutable,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  seedBranchedTreeSessionFixture,
  seedProcessTimelineDemoFixture,
} from "../helpers/electron-app";

test("installed Lancer preserves assistant identity and conversations across restart", async () => {
  test.setTimeout(90_000);
  const executable = process.env.LANCER_INSTALLED_EXECUTABLE;
  test.skip(!executable, "Opt in with the installed Lancer executable path");
  const profile = await makeUserDataDir("lancer-installed-profile-"),
    agentDir = join(profile, "agent"),
    workspace = await makeWorkspace("lancer-installed");
  await seedAgentDir(agentDir, { withOpenAiAuth: false });
  const skillDir = join(workspace, ".agents", "skills", "installed-proof");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    "---\nname: installed-proof\ndescription: Installed workflow persistence proof.\n---\nCheck requirements.\n",
  );
  await seedBranchedTreeSessionFixture(agentDir, workspace, { detailCount: 650 });
  await seedProcessTimelineDemoFixture(agentDir, workspace);
  await writeFile(
    join(profile, "ui-state.json"),
    JSON.stringify({ language: "en", themeMode: "light" }),
  );
  const launch = () =>
    launchDesktopByExecutable(executable!, profile, {
      agentDir,
      initialWorkspaces: [workspace],
      scrubProviderEnv: true,
      envOverrides: { PI_APP_TEST_MODE: undefined },
    });
  let harness = await launch();
  try {
    await harness.focusWindow();
    const page = await harness.firstWindow();
    const doctor = await harness.electronApp.evaluate(({ app, BrowserWindow }) => ({
      executable: process.execPath,
      packaged: app.isPackaged,
      profile: app.getPath("userData"),
      testHooks: "__PI_APP_TEST_HOOKS" in globalThis,
      testMode: process.env.PI_APP_TEST_MODE ?? null,
      visible: BrowserWindow.getAllWindows().some((window) => window.isVisible()),
    }));
    expect(doctor).toEqual({
      executable,
      packaged: true,
      profile,
      testHooks: false,
      testMode: null,
      visible: true,
    });
    await expect(page.getByTestId("lancer-process-surface")).toBeVisible();
    await expect(page.getByTestId("session-trajectory-panel")).toBeVisible();
    await page.locator(".process-tree-scroll").evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect(page.getByTestId("process-global-flow")).toBeInViewport();
    await expect(page.locator(".fbar .r")).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "提交/保存 · Beta detail answer 650", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".conversation-tree-error")).toHaveCount(0);
    await expect(page.getByPlaceholder("搜索会话")).toHaveCount(0);
    const mark = page.getByAltText("Lancer 图标", { exact: true });
    await expect(mark).toBeVisible();
    expect(await mark.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(128);
    expect(await readFile(join(dirname(executable!), "..", "Resources", "icon.icns"))).toEqual(
      await readFile(resolve("apps/desktop/resources/icon.icns")),
    );
    await expect(page.getByRole("button", { name: "总览", exact: true })).toBeVisible();
    await expect(
      page.getByLabel("模型图标预览").getByRole("button", { name: "Gemini", exact: true }),
    ).toBeVisible();
    const current = await getDesktopState(page);
    await page
      .locator(`.session-row[data-session-id="${current.selectedSessionId}"] .session-row__manage`)
      .click();
    await page.getByLabel("会话类型", { exact: true }).selectOption("paper");
    await page.getByRole("button", { name: "保存会话", exact: true }).click();
    await expect(page.getByTestId("module-workflow")).toBeVisible();
    await page.getByLabel("设置模型交接流程").click();
    await page.getByLabel("阶段 1 目标", { exact: true }).fill("核对正式包配置持久化");
    await page.getByLabel("阶段 1 交付物", { exact: true }).fill("重启后保留目标、技能与交付要求");
    await page.locator(".workflow-editor__stage").first().locator("summary").click();
    await page
      .getByRole("group", { name: "阶段 1 技能", exact: true })
      .getByLabel("installed-proof", { exact: true })
      .check();
    await page.getByRole("button", { name: "保存流程", exact: true }).click();
    await page.getByLabel("编辑助手：Lancer", { exact: true }).click();
    await page.getByLabel("名称", { exact: true }).fill("正式包验收助手");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByLabel("选择助手：正式包验收助手", { exact: true })).toBeVisible();
    const sessions = (await getDesktopState(page)).workspaces
      .flatMap((w) => w.sessions.map((s) => s.id))
      .sort();
    expect(sessions.length).toBeGreaterThan(0);
    await harness.close();
    harness = await launch();
    await harness.focusWindow();
    const restarted = await harness.firstWindow();
    await expect(restarted.getByLabel("选择助手：正式包验收助手", { exact: true })).toBeVisible();
    await expect(restarted.getByTestId("session-trajectory-panel")).toBeVisible();
    await expect(restarted.getByTestId("module-workflow")).toBeVisible();
    await restarted.getByLabel("设置模型交接流程").click();
    await expect(restarted.getByLabel("阶段 1 目标", { exact: true })).toHaveValue(
      "核对正式包配置持久化",
    );
    await expect(restarted.getByLabel("阶段 1 交付物", { exact: true })).toHaveValue(
      "重启后保留目标、技能与交付要求",
    );
    await restarted.locator(".workflow-editor__stage").first().locator("summary").click();
    await expect(
      restarted
        .getByRole("group", { name: "阶段 1 技能", exact: true })
        .getByLabel("installed-proof", { exact: true }),
    ).toBeChecked();
    await restarted.screenshot({ path: test.info().outputPath("installed-workflow-editor.png") });
    await restarted.getByRole("button", { name: "取消", exact: true }).click();
    await expect(
      restarted.getByRole("button", { name: "提交/保存 · Beta detail answer 650", exact: true }),
    ).toBeVisible();
    await expect(restarted.locator(".conversation-tree-error")).toHaveCount(0);
    await expect(restarted.locator("[data-flight-head], [data-flight-landing]")).toHaveCount(0);
    expect(
      (await getDesktopState(restarted)).workspaces
        .flatMap((w) => w.sessions.map((s) => s.id))
        .sort(),
    ).toEqual(sessions);
    await restarted.screenshot({ path: test.info().outputPath("installed-restarted.png") });
    await writeFile(
      test.info().outputPath("installed-proof.json"),
      JSON.stringify({ ...doctor, sessions, restarted: true }, null, 2),
    );
  } finally {
    await harness.close();
  }
});
