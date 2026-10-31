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

test("recursive child branches return to their immediate parent and stop as a subtree", async () => {
  test.setTimeout(480_000);
  const auth = getRealAuthConfig();
  if (!auth.enabled) throw new Error(auth.skipReason);
  const profile = await makeUserDataDir(),
    workspace = await makeWorkspace("recursive-branches");
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
  const stop = test.info().outputPath("recording.stop");
  const recorder = spawn(resolve(".artifacts/full-chain-recording/window-recorder"), [
    String(harness.electronApp.process().pid),
    test.info().outputPath("递归孙分支-回传合并与停止.mp4"),
    stop,
  ]);
  const done = once(recorder, "exit");
  let log = "";
  recorder.stdout.on("data", (c) => {
    log += String(c);
  });
  recorder.stderr.on("data", (c) => {
    log += String(c);
  });
  async function select(id: string) {
    const head = page.locator(`.lhc[data-l="lane:${id}"]`);
    await head.scrollIntoViewIfNeeded();
    await head.click();
    await expect(head).toHaveAttribute("data-current", "true");
    await expect(page.getByRole("button", { name: "返回上级会话" })).toBeVisible();
    expect((await getDesktopState(page)).selectedSessionId).toBe(id);
  }
  async function branch(prompts: string[]) {
    const previous = new Set((await getDesktopState(page)).orchestrationChildren.map((c) => c.id));
    await page.getByTestId("launch-parallel-tasks").click();
    for (const [i, text] of prompts.entries())
      await page.getByLabel(`任务 ${i + 1}`, { exact: true }).fill(text);
    await page.getByRole("button", { name: "并行开始", exact: true }).click();
    // Session creation is asynchronous; wait for the new runtime records, not
    // a five-second animation dismissal while native providers initialize.
    await expect
      .poll(
        async () => {
          const children = (await getDesktopState(page)).orchestrationChildren.filter(
            (c) => !previous.has(c.id),
          );
          return children.length === prompts.length && children.every((c) => c.status !== "queued");
        },
        { timeout: 120_000 },
      )
      .toBe(true);
    await expect(page.getByRole("dialog", { name: "开启并行分支" })).not.toBeVisible();
  }
  async function file(name: string) {
    await expect
      .poll(() => readFile(join(workspace, name), "utf8").catch(() => ""), { timeout: 120_000 })
      .toMatch(/\S+/);
  }
  try {
    await expect.poll(() => log, { timeout: 20_000 }).toContain("RECORDING_STARTED");
    await openNewThread(page);
    await page
      .getByLabel("New thread prompt")
      .fill(
        "我们做一次视频剪辑方案研究。我会手动安排分支。你收到分支结果后简短汇总，不要再自行创建任务。",
      );
    await page.getByRole("button", { name: "Start thread", exact: true }).click();
    await expect(page.locator(".process-assistant").last()).toHaveText(/.+/, { timeout: 120_000 });
    const root = (await getDesktopState(page)).selectedSessionId!;
    await branch([
      "你负责画面方案，先用一句话确认。我会在你的会话里继续分配两项子任务。收到结果后汇总为画面方案.md，不要自行创建任务。",
      "写三条视频剪辑的交付检查建议，保存为交付检查.md，给我文件链接。",
    ]);
    await expect
      .poll(async () => (await getDesktopState(page)).orchestrationChildren.length)
      .toBe(2);
    let state = await getDesktopState(page);
    const child = state.orchestrationChildren.find((c) => c.goal.startsWith("你负责画面"))!;
    await select(child.childSessionId);
    await expect(page.getByRole("button", { name: "返回上级会话" })).toBeVisible();
    await branch([
      "写三条蒙版转场的画面建议，保存为蒙版建议.md，给我文件链接。",
      "写三条 Fate 素材选镜头的建议，保存为镜头建议.md，给我文件链接。",
    ]);
    await expect
      .poll(
        async () =>
          (await getDesktopState(page)).orchestrationChildren.filter(
            (c) => c.parentSessionId === child.childSessionId,
          ).length,
      )
      .toBe(2);
    await file("蒙版建议.md");
    await file("镜头建议.md");
    await file("画面方案.md");
    await expect
      .poll(
        async () =>
          (await getDesktopState(page)).orchestrationChildren.every((c) => c.status === "complete"),
        { timeout: 120_000 },
      )
      .toBe(true);
    await page.getByRole("button", { name: "返回上级会话" }).click();
    await expect.poll(async () => (await getDesktopState(page)).selectedSessionId).toBe(root);
    await page.getByTestId("process-focus-tree").click();
    await expect(page.locator(".lhc")).toHaveCount(5);
    await expect(page.locator('[data-event-type="fork"]')).toHaveCount(4);
    await page.screenshot({ path: test.info().outputPath("recursive-delivered.png") });
    const delivered = await getDesktopState(page);
    await branch([
      "在当前工作目录新建父采样.txt，每秒追加当前时间并立即保存，在前台持续五分钟供我测试停止，不要后台启动、不要使用 nohup。不要写到上级目录。",
    ]);
    await file("父采样.txt");
    state = await getDesktopState(page);
    const sampling = state.orchestrationChildren.find((c) => c.goal.includes("父采样.txt"))!;
    await page.getByTestId("process-global-flow").click();
    await select(sampling.childSessionId);
    await branch([
      "在当前工作目录新建孙采样.txt，每秒追加当前时间并立即保存，在前台持续五分钟供我测试停止，不要后台启动、不要使用 nohup。不要写到上级目录。",
    ]);
    await file("孙采样.txt");
    await expect
      .poll(async () => {
        const current = (await getDesktopState(page)).orchestrationChildren.filter(
          (c) => c.id === sampling.id || c.parentSessionId === sampling.childSessionId,
        );
        return current.length === 2 && current.every((c) => c.status === "running");
      })
      .toBe(true);
    await page.getByRole("button", { name: "返回上级会话" }).click();
    await page.getByRole("button", { name: `停止分支：${sampling.title}`, exact: true }).click();
    await expect
      .poll(
        async () => {
          const s = await getDesktopState(page);
          const records = s.orchestrationChildren.filter(
            (c) => c.id === sampling.id || c.parentSessionId === sampling.childSessionId,
          );
          return (
            records.length === 2 &&
            records.every((c) => c.supervisionLoop?.gate === "stop" && c.status !== "running")
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    const stoppedFiles = await Promise.all(
      ["父采样.txt", "孙采样.txt"].map((name) => readFile(join(workspace, name), "utf8")),
    );
    // Observe beyond two one-second write intervals: stopping must terminate
    // the actual foreground tools, not only change their badges.
    await page.waitForTimeout(2500);
    expect(
      await Promise.all(
        ["父采样.txt", "孙采样.txt"].map((name) => readFile(join(workspace, name), "utf8")),
      ),
    ).toEqual(stoppedFiles);
    await page.screenshot({ path: test.info().outputPath("recursive-stopped.png") });
    await writeFile(
      test.info().outputPath("proof.json"),
      JSON.stringify(
        {
          profile,
          workspace,
          root,
          child: child.childSessionId,
          delivered,
          final: await getDesktopState(page),
        },
        null,
        2,
      ),
    );
  } finally {
    await writeFile(stop, "stop");
    const exit = await done;
    await writeFile(test.info().outputPath("capture.log"), log);
    await harness.close();
    expect(exit).toEqual([0, null]);
  }
});
