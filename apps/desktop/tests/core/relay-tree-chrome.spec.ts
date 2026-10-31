import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
} from "../helpers/electron-app";

// Retained real-run files are a presentation fixture; no provider request is made.
test("relay tree chrome retains real nodes and reveals details on hover", async () => {
  const source = process.env.LANCER_RELAY_DISK_ROOT;
  test.skip(!source, "Opt in with retained real-run evidence");
  const root = await makeWorkspace("relay-tree-chrome");
  for (const dir of ["raw", "learning", "remake", "_gates"])
    cpSync(join(source!, dir), join(root, dir), { recursive: true, preserveTimestamps: true });
  writeFileSync(
    join(root, "_gates/active.json"),
    JSON.stringify({ video_id: "dy_e3b0c44298fc_a40fc32e" }),
  );
  const profile = await makeUserDataDir();
  const agentDir = join(profile, "agent");
  await seedAgentDir(agentDir, { withOpenAiAuth: false, withDefaultModel: false });
  const harness = await launchDesktop(profile, {
    agentDir,
    initialWorkspaces: [root],
    scrubProviderEnv: true,
  });
  try {
    const page = await harness.firstWindow();
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1800, 1200),
    );
    await page.evaluate(async () => {
      const app = window.piApp!;
      const state = await app.getState();
      await app.createSession({
        workspaceId: state.workspaces[0]!.id,
        title: "lancer-zone:video|单任务接力",
      });
    });
    await expect(page.locator(".lhc")).toHaveCount(5);
    await expect(page.locator(".rp2 .rh")).toContainText("接力树");
    await expect(page.locator(".rp2 .lgd")).toBeHidden();
    await expect(page.locator(".rp2 .fbar .r")).toBeHidden();
    await expect(page.locator("[data-event-id]").first()).toBeVisible();
    await page.locator(".rp2 .rh").hover();
    mkdirSync(resolve(".lancer-task/out/ui-shell"), { recursive: true });
    await page
      .locator(".rp2")
      .screenshot({ path: resolve(".lancer-task/out/ui-shell/tree-chrome-native.png") });
    await page.locator("[data-event-id]").first().hover();
    await expect(page.locator(".process-event-tip")).toBeVisible();
  } finally {
    await harness.close();
  }
});
