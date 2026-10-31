import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  getDesktopState,
  getRealAuthConfig,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
} from "../helpers/electron-app";

test("records assistant and module management with a real module conversation", async () => {
  test.setTimeout(360_000);
  const auth = getRealAuthConfig();
  if (!auth.enabled) throw new Error(auth.skipReason);
  const provider = process.env.PI_GUI_PROVIDER!,
    model = process.env.PI_GUI_MODEL!;
  const profile = await makeUserDataDir(),
    workspace = await makeWorkspace("management-recording");
  await writeFile(
    join(profile, "ui-state.json"),
    JSON.stringify({ language: "en", themeMode: "light" }),
  );
  const harness = await launchDesktop(profile, {
    initialWorkspaces: [workspace],
    realAuthSourceDir: auth.sourceDir,
    enabledModels: [`${provider}/${model}`],
    scrubProviderEnv: true,
    envOverrides: { PI_APP_TEST_MODE: undefined },
  });
  const page = await harness.firstWindow();
  await harness.focusWindow();
  const stop = test.info().outputPath("management.stop");
  const recorder = spawn(resolve(".artifacts/full-chain-recording/window-recorder"), [
    String(harness.electronApp.process().pid),
    test.info().outputPath("04-模块助手会话管理.mp4"),
    stop,
  ]);
  const done = once(recorder, "exit");
  let log = "";
  recorder.stdout.on("data", (chunk) => {
    log += String(chunk);
  });
  recorder.stderr.on("data", (chunk) => {
    log += String(chunk);
  });
  try {
    await expect.poll(() => log, { timeout: 20_000 }).toContain("RECORDING_STARTED");
    await page.getByLabel("添加 AI 助手", { exact: true }).click();
    await page.getByLabel("名称", { exact: true }).fill("资料助手");
    await page.getByLabel("头像 1", { exact: true }).click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByLabel("选择助手：资料助手", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
    await page.getByLabel("名称", { exact: true }).fill("研究搭档");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByRole("button", { name: "新增模块", exact: true }).click();
    let manager = page.getByRole("dialog", { name: "管理模块", exact: true });
    await manager.getByLabel("模块名称", { exact: true }).fill("产品研究");
    await manager.getByLabel("模块说明", { exact: true }).fill("从资料到结论，保留独立交付文件");
    await manager.getByRole("button", { name: "配置阶段、模型与 Skill" }).click();
    const workflow = page.getByRole("dialog", { name: "配置模块流程" });
    await workflow.getByLabel("阶段 1 名称", { exact: true }).fill("资料收集");
    await workflow.getByLabel("阶段 1 模型", { exact: true }).selectOption(`${provider}/${model}`);
    await workflow.getByLabel("阶段 1 目标", { exact: true }).fill("梳理用户最关心的问题");
    await workflow.getByLabel("阶段 1 交付物", { exact: true }).fill("研究清单.md");
    await workflow.getByRole("button", { name: "保存流程", exact: true }).click();
    await manager.getByRole("button", { name: "保存模块", exact: true }).click();
    await page.getByRole("button", { name: "产品研究", exact: true }).click();
    await page
      .getByTestId("new-thread-composer")
      .fill(
        "我们准备研究AI工作区的使用体验。先列出三个最值得关注的问题，保存为研究清单.md，并给我文件链接。",
      );
    await page.getByRole("button", { name: "Start thread", exact: true }).click();
    await expect(page.locator(".process-assistant").last()).toHaveText(/.+/, { timeout: 120_000 });
    await expect
      .poll(
        async () => {
          const s = await getDesktopState(page);
          return s.workspaces.flatMap((w) => w.sessions).find((x) => x.id === s.selectedSessionId)
            ?.status;
        },
        { timeout: 180_000 },
      )
      .toBe("idle");
    await expect(page.getByTestId("module-workflow")).toContainText("资料收集");
    await page.getByLabel(/^管理会话：/).click();
    await page.getByLabel("会话名称", { exact: true }).fill("AI工作区体验研究");
    await page.getByRole("button", { name: "保存会话", exact: true }).click();
    await page.getByTestId("process-focus-tree").click();
    await page.getByTestId("process-global-flow").click();
    await page.getByLabel("Archive AI工作区体验研究", { exact: true }).click();
    await page.locator(".archived-thread-group__toggle").click();
    await page.getByLabel(/^Restore .*AI工作区体验研究$/).click();
    await page.getByRole("button", { name: "产品研究", exact: true }).click({ button: "right" });
    manager = page.getByRole("dialog", { name: "管理模块", exact: true });
    await manager.getByLabel("模块名称", { exact: true }).fill("体验研究");
    await manager.getByRole("button", { name: "保存模块", exact: true }).click();
    await page.getByRole("button", { name: "体验研究", exact: true }).click({ button: "right" });
    await page.getByRole("button", { name: "删除模块", exact: true }).click();
    await page.getByRole("button", { name: "确认删除模块", exact: true }).click();
    await page.getByRole("button", { name: "管理模块", exact: true }).click();
    manager = page.getByRole("dialog", { name: "管理模块", exact: true });
    await manager
      .getByLabel("选择模块", { exact: true })
      .selectOption({ label: "体验研究（已删除）" });
    await manager.getByRole("button", { name: "恢复模块", exact: true }).click();
    await expect(page.getByRole("button", { name: "体验研究", exact: true })).toBeVisible();
    await page.getByLabel("选择助手：研究搭档", { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "删除", exact: true }).click();
    await page.getByRole("button", { name: /^(转交并删除助手|删除助手)$/ }).click();
    await expect(page.getByLabel("选择助手：研究搭档", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("management-complete.png") });
    await writeFile(
      test.info().outputPath("proof.json"),
      JSON.stringify(
        {
          workspace,
          profile,
          completed: [
            "assistant-create-avatar-rename-delete",
            "module-create-configure-rename-delete-restore",
            "real-module-conversation",
            "session-rename-archive-restore",
            "focus-and-all-trees",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await writeFile(stop, "stop");
    const code = await done;
    await writeFile(test.info().outputPath("capture.log"), log);
    await harness.close();
    expect(code).toEqual([0, null]);
  }
});
