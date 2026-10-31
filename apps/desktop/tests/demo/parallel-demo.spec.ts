import { writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
  seedAgentDir,
  writeProjectExtension,
} from "../helpers/electron-app";

test("records four concurrent task branches and their saved joins", async () => {
  test.setTimeout(120_000);
  const profile = await makeUserDataDir(),
    agentDir = join(profile, "agent"),
    workspace = await makeWorkspace("assistant-parallel");
  await seedAgentDir(agentDir, { withOpenAiAuth: false, withDefaultModel: false });
  await writeFile(
    join(profile, "ui-state.json"),
    JSON.stringify({ themeMode: "light", language: "en" }),
  );
  await writeFile(
    join(agentDir, "settings.json"),
    JSON.stringify({
      defaultProvider: "parallel-fixture",
      defaultModel: "deepseek-demo",
      enabledModels: ["parallel-fixture/deepseek-demo"],
      compaction: { enabled: false },
    }),
  );
  await writeProjectExtension(
    workspace,
    "parallel-fixture.ts",
    `
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { Type } from "@sinclair/typebox";
import { access } from "node:fs/promises";
const release = ${JSON.stringify(join(workspace, "release-parallel"))};
export default function(pi) {
  pi.registerTool({ name: "parallel_probe", label: "Parallel probe", description: "Local deterministic streaming probe", parameters: Type.Object({ tag: Type.String() }),
    async execute(id, params, signal, onUpdate) {
      let output = "";
      let i = 0;
      do {
        if (signal?.aborted) throw new Error("Probe aborted");
        output += params.tag + " line " + i++ + "\\n";
        onUpdate?.({ content: [{ type: "text", text: output }], details: {} });
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (await access(release).then(() => false, () => true));
      return { content: [{ type: "text", text: output }], details: { exitCode: 0 } };
    }
  });
  pi.registerProvider("parallel-fixture", { baseUrl: "http://127.0.0.1:9/unused", apiKey: "LOCAL_FIXTURE", api: "parallel-fixture",
    models: [{ id: "deepseek-demo", name: "DeepSeek · 本地演示", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    streamSimple(model, context) {
      const last = context.messages.at(-1);
      const user = context.messages.filter(m => m.role === "user").at(-1);
      const text = typeof user?.content === "string" ? user.content : (user?.content ?? []).filter(p => p.type === "text").map(p => p.text).join(" ");
      const tool = /worker-[ABCD]/.test(text) && !text.includes("[return:") && last?.role !== "toolResult";
      const content = tool ? [{ type: "toolCall", id: "probe-" + Date.now(), name: "parallel_probe", arguments: { tag: text.match(/worker-[ABCD]/)[0] } }] : [{ type: "text", text: text.includes("[return:") ? "分支结果已收到，已汇总到当前会话。" : /worker-[ABCD]/.test(text) ? "该路演示输出已完成，结果已保存，回传主会话。" : "准备就绪。四路任务将独立执行，完成后回传并保存节点。" }];
      const message = { role: "assistant", content, api: model.api, provider: model.provider, model: model.id, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: tool ? "toolUse" : "stop", timestamp: Date.now() };
      const stream = createAssistantMessageEventStream();
      stream.push({ type: "start", partial: { ...message, content: [] } });
      if (!tool) stream.push({ type: "text_delta", contentIndex: 0, delta: content[0].text, partial: message });
      stream.push({ type: "done", reason: tool ? "toolUse" : "stop", message }); return stream;
    }
  });
}
`,
  );
  const harness = await launchDesktop(profile, {
    agentDir,
    initialWorkspaces: [workspace],
    scrubProviderEnv: true,
    testMode: "foreground",
    envOverrides: { PI_APP_TEST_ORB: "1" },
    recordVideoDir: test.info().outputPath("video"),
    recordVideoSize: { width: 1480, height: 980 },
  });
  const page = await harness.firstWindow();
  const video = page.video();
  let orbVideo: ReturnType<typeof page.video> = null;
  try {
    await openNewThread(page);
    await page.getByLabel("New thread prompt").fill("四路并行演示 · 本地测试模型");
    await page.getByRole("button", { name: "Start thread", exact: true }).click();
    await expect(page.locator(".process-assistant")).toContainText("准备就绪");
    await page.waitForTimeout(1800);
    await page.getByTestId("launch-parallel-tasks").click();
    await page.getByRole("button", { name: "再加一个任务", exact: true }).click();
    await page.getByRole("button", { name: "再加一个任务", exact: true }).click();
    for (const [i, topic] of ["竞品调研", "GitHub 项目研究", "论文筛选", "视频复刻"].entries()) {
      await page
        .getByLabel(`任务 ${i + 1}`, { exact: true })
        .fill(`${topic} · worker-${String.fromCharCode(65 + i)}（演示输出）`);
    }
    await page.waitForTimeout(1800);
    await page.getByRole("button", { name: "并行开始", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await getDesktopState(page)).orchestrationChildren.filter((c) => c.status === "running")
            .length,
        { timeout: 20000 },
      )
      .toBe(4);
    await expect(page.locator('[data-event-type="fork"]')).toHaveCount(4);
    await page.getByTestId("process-global-flow").click();
    await page.getByRole("button", { name: "总览", exact: true }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: test.info().outputPath("four-running.png") });
    const orb = harness.electronApp.windows().find((p) => p.url().includes("pi-orb.html"))!;
    orbVideo = orb.video();
    await orb.locator(".pi-orb").click();
    await expect(orb.locator(".pane")).toHaveCount(5);
    await expect
      .poll(() =>
        orb
          .locator("textarea.log")
          .evaluateAll((nodes) => nodes.map((n) => (n as HTMLTextAreaElement).value).join("\n")),
      )
      .toContain("worker-D line");
    await orb.waitForTimeout(4000);
    await orb.screenshot({ path: test.info().outputPath("parallel-live-output.png") });
    await orb.getByLabel("收起", { exact: true }).click();
    await harness.focusWindow();
    await writeFile(join(workspace, "release-parallel"), "release");
    await expect
      .poll(
        async () =>
          (await getDesktopState(page)).orchestrationChildren.flatMap((c) =>
            c.evidence.filter(
              (e) => e.toolName === "lancer-branch-return" && e.status === "accepted",
            ),
          ).length,
        { timeout: 20000 },
      )
      .toBe(4);
    await expect(page.locator('[data-event-type="merge"]')).toHaveCount(4);
    await page.waitForTimeout(2200);
    await page.getByTestId("process-focus-tree").click();
    await expect(page.locator(".lhc")).toHaveCount(5);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: test.info().outputPath("four-saved-joins.png") });
    await writeFile(
      test.info().outputPath("parallel-proof.json"),
      JSON.stringify(
        {
          branches: (await getDesktopState(page)).orchestrationChildren.map((c) => ({
            id: c.id,
            status: c.status,
            returns: c.evidence.filter(
              (e) => e.toolName === "lancer-branch-return" && e.status === "accepted",
            ).length,
          })),
          provider: "deterministic local runtime fixture; no remote model request",
        },
        null,
        2,
      ),
    );
  } finally {
    await writeFile(join(workspace, "release-parallel"), "release");
    await harness.close();
    if (video) await copyFile(await video.path(), test.info().outputPath("parallel-main.webm"));
    if (orbVideo)
      await copyFile(await orbVideo.path(), test.info().outputPath("parallel-orb.webm"));
  }
});
