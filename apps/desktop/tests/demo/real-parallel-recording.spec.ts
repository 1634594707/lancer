import { readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  getDesktopState,
  getRealAuthConfig,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
} from "../helpers/electron-app";

test("records complete real-provider parallel execution", async () => {
  test.setTimeout(600_000);
  const auth = getRealAuthConfig();
  test.skip(!auth.enabled, auth.skipReason);
  const provider = process.env.PI_GUI_PROVIDER,
    model = process.env.PI_GUI_MODEL;
  if (!provider || !model) throw new Error("A configured provider and model are required");
  const profile = await makeUserDataDir(),
    workspace = await makeWorkspace("real-branches");
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
    recordVideoDir: test.info().outputPath("video"),
    recordVideoSize: { width: 1480, height: 980 },
  });
  const page = await harness.firstWindow();
  const video = page.video();
  try {
    await harness.focusWindow();
    const doctor = await harness.electronApp.evaluate(({ BrowserWindow }) => ({
      testMode: process.env.PI_APP_TEST_MODE ?? null,
      testHooks: "__PI_APP_TEST_HOOKS" in globalThis,
      visible: BrowserWindow.getAllWindows()[0]?.isVisible(),
    }));
    expect(doctor).toEqual({ testMode: null, testHooks: false, visible: true });
    await openNewThread(page);
    await page
      .getByLabel("New thread prompt")
      .fill(
        "我准备并行检查悬浮助手的代码显示、布局、日志和运行状态。先确认一下，我接下来会分配四项任务，完成后请帮我简短汇总。",
      );
    await page.getByRole("button", { name: "Start thread", exact: true }).click();
    await expect(page.locator(".process-assistant").last()).toHaveText(/.+/, {
      timeout: 120_000,
    });
    await expect(page.getByTestId("send")).not.toHaveAttribute("aria-label", "Stop run");
    const parent = await getDesktopState(page);
    await page.getByTestId("process-global-flow").click();
    await page.getByRole("button", { name: "总览", exact: true }).click();
    await page.getByTestId("launch-parallel-tasks").click();
    await page.getByRole("button", { name: "再加一个任务", exact: true }).click();
    await page.getByRole("button", { name: "再加一个任务", exact: true }).click();
    for (const [i, tag] of ["A", "B", "C", "D"].entries()) {
      const sources = [
        "apps/desktop/src/pi-orb/orb.ts",
        "apps/desktop/src/pi-orb/orb.css",
        "apps/desktop/electron/control/orb-output.ts",
        "apps/desktop/electron/windows/pi-orb-window.ts",
      ];
      const source = join(process.cwd(), sources[i]!);
      const topics = ["代码显示", "布局与可读性", "日志完整性", "运行状态与更新开销"];
      await page
        .getByLabel(`任务 ${i + 1}`, { exact: true })
        .fill(
          `检查${topics[i]}。阅读 ${source}，找出两处值得改进的地方，把简短中文建议写到当前工作区的 ${tag}.md，并给我文件链接。只检查，不修改源码。`,
        );
    }
    await page.getByRole("button", { name: "并行开始", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await getDesktopState(page)).orchestrationChildren.filter((c) => c.status === "running")
            .length,
        { timeout: 60_000 },
      )
      .toBe(4);
    const running = await getDesktopState(page);
    expect(running.orchestrationChildren.every((c) => c.status === "running")).toBe(true);
    expect(new Set(running.orchestrationChildren.map((c) => c.childSessionId)).size).toBe(4);
    await page.screenshot({ path: test.info().outputPath("four-real-running.png") });
    for (const tag of ["A", "B", "C", "D"]) {
      await expect
        .poll(() => readFile(join(workspace, `${tag}.md`), "utf8").catch(() => ""), {
          timeout: 60_000,
        })
        .toMatch(/.{30}/s);
    }
    await expect
      .poll(
        async () =>
          (await getDesktopState(page)).orchestrationChildren.flatMap((c) =>
            c.evidence.filter(
              (e) => e.toolName === "lancer-branch-return" && e.status === "accepted",
            ),
          ).length,
        { timeout: 120_000 },
      )
      .toBe(4);
    await expect(page.locator('[data-event-type="merge"]')).toHaveCount(4);
    expect((await getDesktopState(page)).selectedSessionId).toBe(parent.selectedSessionId);
    await expect(page.getByTestId("send")).not.toHaveAttribute("aria-label", "Stop run");
    await page.waitForTimeout(4000);
    await page.screenshot({ path: test.info().outputPath("real-provider-saved-joins.png") });
    await writeFile(
      test.info().outputPath("proof.json"),
      JSON.stringify(
        {
          provider,
          model,
          doctor,
          concurrentChildren: running.orchestrationChildren.map((c) => c.childSessionId),
          returned: 4,
          files: ["A.md", "B.md", "C.md", "D.md"],
        },
        null,
        2,
      ),
    );
  } finally {
    await harness.close();
    if (video) await copyFile(await video.path(), test.info().outputPath("complete-real-run.webm"));
  }
});
