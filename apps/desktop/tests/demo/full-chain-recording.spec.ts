import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  getDesktopState,
  getRealAuthConfig,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
} from "../helpers/electron-app";

test("records single, branched, and multiple real conversation trees through delivery", async () => {
  test.setTimeout(1_200_000);
  const auth = getRealAuthConfig();
  if (!auth.enabled) throw new Error(auth.skipReason);
  const provider = process.env.PI_GUI_PROVIDER,
    model = process.env.PI_GUI_MODEL;
  if (!provider || !model) throw new Error("Provider and model required");
  const profile = await makeUserDataDir(),
    workspace = await makeWorkspace("full-chain");
  await mkdir(join(workspace, "资料"));
  await copyFile("docs/architecture.md", join(workspace, "资料", "架构.md"));
  await copyFile("apps/desktop/README.md", join(workspace, "资料", "桌面应用.md"));
  await copyFile("docs/ci-baseline.md", join(workspace, "资料", "测试流程.md"));
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
  const chapters: object[] = [];
  let recorder: ReturnType<typeof spawn> | undefined,
    stopFile = "",
    recorderDone: Promise<unknown> | undefined;
  async function startRecording(name: string) {
    stopFile = test.info().outputPath(`${name}.stop`);
    const output = test.info().outputPath(`${name}.mp4`);
    recorder = spawn(resolve(".artifacts/full-chain-recording/window-recorder"), [
      String(harness.electronApp.process().pid),
      output,
      stopFile,
    ]);
    recorderDone = once(recorder, "exit");
    let log = "";
    recorder.stdout!.on("data", (chunk) => {
      log += String(chunk);
    });
    recorder.stderr!.on("data", (chunk) => {
      log += String(chunk);
    });
    await expect.poll(() => log, { timeout: 20_000 }).toContain("RECORDING_STARTED");
    chapters.push({ name, output, started: new Date().toISOString() });
    return async () => {
      await writeFile(stopFile, "stop");
      const code = await recorderDone;
      await writeFile(test.info().outputPath(`${name}.capture.log`), log);
      expect(code).toEqual([0, null]);
      recorder = undefined;
    };
  }
  async function idle() {
    await expect
      .poll(
        async () => {
          const state = await getDesktopState(page);
          return state.workspaces
            .flatMap((w) => w.sessions)
            .find((s) => s.id === state.selectedSessionId)?.status;
        },
        { timeout: 180_000 },
      )
      .toBe("idle");
  }
  async function rename(title: string) {
    const state = await getDesktopState(page);
    await page
      .locator(`[data-session-id="${state.selectedSessionId}"]`)
      .getByLabel(/^管理会话：/)
      .click();
    await page.getByLabel("会话名称", { exact: true }).fill(title);
    await page.getByRole("button", { name: "保存会话", exact: true }).click();
  }
  async function create(title: string, prompt: string) {
    await openNewThread(page);
    await page.getByLabel("New thread prompt").fill(prompt);
    await page.getByRole("button", { name: "Start thread", exact: true }).click();
    await expect(page.locator(".process-assistant").last()).toHaveText(/.+/, { timeout: 180_000 });
    await idle();
    await rename(title);
    return (await getDesktopState(page)).selectedSessionId!;
  }
  async function select(id: string) {
    await page.locator(`[data-session-id="${id}"] .shell-sidebar__session`).click();
    await expect.poll(async () => (await getDesktopState(page)).selectedSessionId).toBe(id);
  }
  async function send(prompt: string) {
    await page.getByTestId("composer").fill(prompt);
    await page.getByTestId("send").click();
  }
  async function file(name: string) {
    await expect
      .poll(() => readFile(join(workspace, name), "utf8").catch(() => ""), { timeout: 180_000 })
      .toMatch(/.{30}/s);
  }
  async function branch(prompts: string[]) {
    await page.getByTestId("launch-parallel-tasks").click();
    for (const [i, prompt] of prompts.entries())
      await page.getByLabel(`任务 ${i + 1}`, { exact: true }).fill(prompt);
    await page.getByRole("button", { name: "并行开始", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "开启并行分支" })).not.toBeVisible();
  }
  async function returns(count: number) {
    await expect
      .poll(
        async () =>
          (await getDesktopState(page)).orchestrationChildren.filter((c) =>
            c.evidence.some(
              (e) => e.toolName === "lancer-branch-return" && e.status === "accepted",
            ),
          ).length,
        { timeout: 240_000 },
      )
      .toBe(count);
  }
  try {
    await harness.focusWindow();
    const doctor = await harness.electronApp.evaluate(({ BrowserWindow }) => ({
      testMode: process.env.PI_APP_TEST_MODE ?? null,
      testHooks: "__PI_APP_TEST_HOOKS" in globalThis,
      visible: BrowserWindow.getAllWindows()[0]?.isVisible(),
    }));
    expect(doctor).toEqual({ testMode: null, testHooks: false, visible: true });
    let stop = await startRecording("01-会话创建到交付");
    const single = await create(
      "桌面应用初探",
      "阅读资料/桌面应用.md，用三句话介绍这个项目，把简介保存为项目简介.md，并给我文件链接。只阅读资料，不修改源码。",
    );
    await file("项目简介.md");
    await send(
      "根据刚才的介绍，画一张简洁的会话流程图，保存为会话流程.svg。用一句话说明，并给我文件链接。",
    );
    await file("会话流程.svg");
    await idle();
    await page.getByTestId("process-focus-tree").click();
    await page.screenshot({ path: test.info().outputPath("01-delivery.png") });
    await stop();

    stop = await startRecording("02-分叉并行与合并");
    const parent = await create(
      "架构研究",
      "我们来研究项目架构。我接下来会分配两项并行检查，完成后一起整理结论。现在简短确认即可。",
    );
    await page.getByTestId("process-global-flow").click();
    await branch([
      "阅读资料/架构.md，梳理界面到模型的调用关系，写到调用关系.md。给出三条发现和文件链接，不修改源码。",
      "阅读资料/架构.md，检查会话与工作区的边界，写到会话边界.md。给出三条发现和文件链接，不修改源码。",
    ]);
    await expect
      .poll(
        async () =>
          (await getDesktopState(page)).orchestrationChildren.filter((c) => c.status === "running")
            .length,
      )
      .toBe(2);
    await page.screenshot({ path: test.info().outputPath("02-parallel.png") });
    await returns(2);
    await file("调用关系.md");
    await file("会话边界.md");
    await idle();
    await send("把调用关系.md和会话边界.md合并成架构结论.md，保留最重要的三点，给我文件链接。");
    await file("架构结论.md");
    await idle();
    await expect(page.locator('[data-event-type="merge"]')).toHaveCount(2);
    await page.screenshot({ path: test.info().outputPath("02-merged.png") });
    await stop();

    stop = await startRecording("03-多会话多树并行分叉交付");
    const topics = [
      {
        title: "交互体验研究",
        source: "桌面应用",
        prefix: "体验",
        aspects: ["会话操作", "工作区切换"],
      },
      {
        title: "GitHub架构研究",
        source: "架构",
        prefix: "架构",
        aspects: ["模块职责", "数据边界"],
      },
      {
        title: "测试方案沉淀",
        source: "测试流程",
        prefix: "测试",
        aspects: ["验证范围", "故障保护"],
      },
    ];
    const roots: string[] = [];
    for (const topic of topics)
      roots.push(
        await create(
          topic.title,
          `我们来做${topic.title}。稍后会有两项并行任务，返回后再整理交付。现在只需一句话确认。`,
        ),
      );
    let peakRunning = 0;
    for (const [i, topic] of topics.entries()) {
      await select(roots[i]!);
      await branch(
        topic.aspects.map(
          (aspect, n) =>
            `阅读资料/${topic.source}.md，重点研究${aspect}。把三个发现和两个建议写到${topic.prefix}-${n + 1}.md，回复简短结论和文件链接。只检查资料，不修改源码。`,
        ),
      );
      peakRunning = Math.max(
        peakRunning,
        (await getDesktopState(page)).orchestrationChildren.filter((c) => c.status === "running")
          .length,
      );
    }
    await page.getByTestId("process-global-flow").click();
    await page.getByRole("button", { name: "总览", exact: true }).click();
    const simultaneous = await getDesktopState(page);
    const activeParents = new Set(
      simultaneous.orchestrationChildren
        .filter((c) => c.status === "running")
        .map((c) => c.parentSessionId),
    );
    expect(activeParents.size).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: test.info().outputPath("03-multiple-trees-running.png") });
    await returns(8);
    for (const [i, topic] of topics.entries()) {
      await select(roots[i]!);
      await idle();
      await send(
        `把${topic.prefix}-1.md和${topic.prefix}-2.md合并成${topic.prefix}-交付.md，只保留三条结论和下一步建议，给我文件链接。`,
      );
    }
    await page.getByTestId("process-global-flow").click();
    for (const topic of topics) await file(`${topic.prefix}-交付.md`);
    await expect
      .poll(
        async () =>
          (await getDesktopState(page)).workspaces
            .flatMap((w) => w.sessions)
            .filter((s) => s.status === "running").length,
        { timeout: 180_000 },
      )
      .toBe(0);
    await expect(page.locator('[data-event-type="merge"]')).toHaveCount(8);
    await page.screenshot({ path: test.info().outputPath("03-all-delivered.png") });
    await writeFile(
      test.info().outputPath("proof.json"),
      JSON.stringify(
        {
          doctor,
          provider,
          model,
          workspace,
          chapters,
          single,
          parent,
          roots,
          peakRunning,
          concurrentParents: [...activeParents],
          returnedBranches: 8,
          final: await getDesktopState(page),
        },
        null,
        2,
      ),
    );
    await stop();
  } finally {
    if (recorder) {
      await writeFile(stopFile, "stop");
      await recorderDone;
    }
    await harness.close();
  }
});
