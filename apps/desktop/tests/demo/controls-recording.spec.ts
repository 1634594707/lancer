import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  getDesktopState,
  getRealAuthConfig,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
} from "../helpers/electron-app";

test("records queued edits, cancellation, live CLI assistant and final delivery", async () => {
  test.setTimeout(360_000);
  const auth = getRealAuthConfig();
  if (!auth.enabled) throw new Error(auth.skipReason);
  const profile = await makeUserDataDir(),
    workspace = await makeWorkspace("controls-recording");
  await writeFile(
    join(profile, "ui-state.json"),
    JSON.stringify({ language: "en", themeMode: "light" }),
  );
  const harness = await launchDesktop(profile, {
    initialWorkspaces: [workspace],
    realAuthSourceDir: auth.sourceDir,
    enabledModels: [`${process.env.PI_GUI_PROVIDER}/${process.env.PI_GUI_MODEL}`],
    scrubProviderEnv: true,
    envOverrides: { PI_APP_TEST_MODE: undefined },
  });
  const page = await harness.firstWindow();
  await harness.focusWindow();
  const stop = test.info().outputPath("controls.stop");
  const recorder = spawn(resolve(".artifacts/full-chain-recording/window-recorder"), [
    String(harness.electronApp.process().pid),
    test.info().outputPath("05-队列停止与悬浮助手.mp4"),
    stop,
    "--app",
  ]);
  const done = once(recorder, "exit");
  let log = "";
  recorder.stdout.on("data", (c) => {
    log += String(c);
  });
  recorder.stderr.on("data", (c) => {
    log += String(c);
  });
  try {
    await expect.poll(() => log, { timeout: 20_000 }).toContain("RECORDING_STARTED");
    await page.waitForTimeout(800);
    await openNewThread(page);
    await page
      .getByLabel("New thread prompt")
      .fill("请每秒记录一次当前时间，连续30秒，边采样边写入运行采样.txt。结束后给我文件链接。");
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Start thread", exact: true }).click();
    await expect
      .poll(() => readFile(join(workspace, "运行采样.txt"), "utf8").catch(() => ""), {
        timeout: 120_000,
      })
      .toMatch(/\d/);
    const orb = harness.electronApp.windows().find((p) => p.url().includes("pi-orb.html"))!;
    await orb.locator(".pi-orb").click();
    await expect(orb.locator(".pi-panel")).toBeVisible();
    await expect(orb.locator("textarea.log").first()).not.toHaveValue("");
    await orb.screenshot({ path: test.info().outputPath("live-cli.png") });
    await page.waitForTimeout(1800);
    await orb.getByLabel("收起", { exact: true }).click();
    await page.getByTestId("composer").fill("完成后用一句话总结。");
    await page.getByTestId("composer").press("Enter");
    const queued = page.getByTestId("queued-composer-message");
    await expect(queued).toContainText("完成后用一句话总结。");
    await queued.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByTestId("composer").fill("保留采样文件，只用一句话总结。");
    await page.getByTestId("composer").press("Enter");
    await expect(queued).toContainText("保留采样文件，只用一句话总结。");
    await page.waitForTimeout(800);
    await queued.getByRole("button", { name: /^Delete queued message/ }).click();
    await expect(queued).toHaveCount(0);
    await page.getByTestId("send").click();
    await expect
      .poll(async () => {
        const s = await getDesktopState(page);
        return s.workspaces.flatMap((w) => w.sessions).find((x) => x.id === s.selectedSessionId)
          ?.status;
      })
      .toBe("idle");
    await page.screenshot({ path: test.info().outputPath("stopped.png") });
    await page
      .getByTestId("composer")
      .fill(
        "读取运行采样.txt，说明实际完成了多少次采样，把简短结果保存为采样说明.md，给我文件链接。不需要继续采样。",
      );
    await page.getByTestId("send").click();
    await expect
      .poll(() => readFile(join(workspace, "采样说明.md"), "utf8").catch(() => ""), {
        timeout: 120_000,
      })
      .toMatch(/.{20}/s);
    await expect
      .poll(
        async () => {
          const s = await getDesktopState(page);
          return s.workspaces.flatMap((w) => w.sessions).find((x) => x.id === s.selectedSessionId)
            ?.status;
        },
        { timeout: 120_000 },
      )
      .toBe("idle");
    await page.waitForTimeout(1800);
    await page.screenshot({ path: test.info().outputPath("final-delivery.png") });
    await writeFile(
      test.info().outputPath("proof.json"),
      JSON.stringify(
        {
          workspace,
          profile,
          completed: [
            "real-time-sampling",
            "live-cli-panel",
            "queue-edit-delete",
            "stop-run",
            "resume-conversation",
            "file-delivery",
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
