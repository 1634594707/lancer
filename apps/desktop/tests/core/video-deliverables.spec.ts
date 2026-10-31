import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { VIDEO_LEARN_PROCESS_ID } from "../../contracts/video-learn";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  seedLancerScreenshotUiPrefs,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

// Synthetic disk gates exercise the existing status reader/poll, not provider execution.
// Session creation is presentation setup: this test deliberately sends no model requests.
test("video conversation reveals completed files and keeps failed attempts on its own tree", async () => {
  test.setTimeout(90_000);
  const profile = await makeUserDataDir();
  const root = await makeWorkspace("video-deliverables");
  const agentDir = join(profile, "agent");
  await seedLancerScreenshotUiPrefs(profile);
  await seedAgentDir(agentDir, { withOpenAiAuth: false, withDefaultModel: false });
  const id = "sidebar_task";
  const json = async (path: string, value: unknown) => {
    await writeFile(join(root, path), JSON.stringify(value));
  };
  await mkdir(join(root, "_gates"), { recursive: true });
  await json("_gates/active.json", { video_id: id });
  const harness = await launchDesktop(profile, {
    agentDir,
    initialWorkspaces: [root],
    scrubProviderEnv: true,
  });
  const pid = harness.electronApp.process().pid;
  try {
    const page = await harness.firstWindow();
    await harness.focusWindow();
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
    );
    await waitForWorkspaceByPath(page, root);
    await page.evaluate(async () => {
      const app = window.piApp!;
      const state = await app.getState();
      await app.createSession({
        workspaceId: state.workspaces[0]!.id,
        title: "lancer-zone:video|待办：下载、看帧、失败重试",
      });
    });
    const owner = await page.evaluate(async () => {
      const state = await window.piApp!.getState();
      return {
        workspaceId: state.selectedWorkspaceId,
        sessionId: state.selectedSessionId,
        role: "download",
      };
    });
    await json(`_gates/owner.${id}.json`, owner);
    const sidebar = page.getByTestId("lancer-zone-sidebar");
    const products = page.getByTestId("transcript").getByRole("region", { name: "视频交付物" });
    await expect(products).toHaveCount(0);
    await expect(sidebar.getByTestId("process-session-row")).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath("01-pending.png") });

    const source = `raw/videos/${id}/source.mp4`;
    await mkdir(join(root, `raw/videos/${id}`), { recursive: true });
    const bytes = "synthetic video delivery fixture";
    const sha = createHash("sha256").update(bytes).digest("hex");
    await writeFile(join(root, source), bytes);
    const gate = (step: string, status: string, artifacts: Record<string, string>) => ({
      process_id: VIDEO_LEARN_PROCESS_ID,
      video_id: id,
      step,
      ts: "2026-01-01T00:00:00Z",
      status_code: status,
      error_code: status.endsWith(".fail") ? "E_MODEL_FAIL" : null,
      sha256: sha,
      artifacts,
    });
    await json("_gates/download.sidebar_task.json", gate("download", "download.ok", { source }));
    // Reload drives a fresh status read without waiting for a wall-clock polling interval.
    await page.reload();
    await expect(products.locator("strong")).toHaveText(["原视频"]);
    await products.locator("summary").click();
    await expect(products).toContainText(source);
    await expect(products).toContainText(sha);
    await page.screenshot({ path: test.info().outputPath("02-source.png") });

    const run = `remake/out/${id}/run-1`;
    await mkdir(join(root, run, "export-1"), { recursive: true });
    await writeFile(join(root, run, "scene.js"), "// mock template, not a delivered video");
    await json(
      "_gates/remake.sidebar_task.json",
      gate("remake", "remake.ok", { scene: `${run}/scene.js` }),
    );
    await page.reload();
    await expect(products.locator("summary")).toHaveCount(1);
    const output = `${run}/export-1/animation.mp4`;
    await writeFile(join(root, output), bytes);
    await json("_gates/remake.sidebar_task.json", gate("remake", "remake.fail", { video: output }));
    await page.reload();
    await expect(products.locator("summary")).toHaveCount(1);
    await expect(
      page
        .getByTestId("process-tree")
        .locator('[data-event-type="test"][aria-label*="E_MODEL_FAIL"]'),
    ).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath("03-failed-attempt.png") });

    await json("_gates/remake.sidebar_task.json", gate("remake", "remake.ok", { video: output }));
    await page.reload();
    await expect(products.locator("summary")).toHaveCount(2);
    await expect(products.locator("strong").nth(1)).toHaveText("复刻视频");
    await products.locator("summary").nth(1).click();
    await expect(products).toContainText(output);
    await expect(products.getByRole("button", { name: "打开复刻视频" })).toBeEnabled();
    await expect(products).not.toContainText("scene.js");
    await expect(sidebar).toContainText("待办：下载、看帧、失败重试");
    await page.screenshot({ path: test.info().outputPath("04-delivered.png") });
    await test.info().attach("proof", {
      body: JSON.stringify({
        proof: "fixture-backed visible Electron; synthetic disk gates, no provider request",
        pid,
        root,
        checkpoints: ["pending", "download.ok", "no-video", "remake.fail", "remake.ok", "details"],
      }),
      contentType: "application/json",
    });
  } finally {
    await harness.close();
  }
});
