import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  LANCER_SCREENSHOT_ENABLED_MODELS,
  launchDesktop,
  makeUserDataDir,
  prepareLancerScreenshotChrome,
  seedAgentDir,
  seedLancerScreenshotUiPrefs,
  selectSession,
  waitForSelectedSessionReady,
  waitForWorkspaceByPath,
  waitForTimelineLayout,
} from "../helpers/electron-app";
import { makeLancerScreenshotFixture } from "../helpers/lancer-screenshot-fixture";

/** Read the actual painted SVG endpoint in screen coordinates, not reported metadata. */
async function selectionError(page: Page) {
  return page.evaluate(() => {
    const paths = [
      ...document.querySelectorAll<SVGPathElement>('path[data-curve-kind="selection"]'),
    ];
    if (!paths.length) return null;
    return Math.max(
      ...paths.map((path) => {
        const node = document.querySelector(
          `[data-anchor-key="${CSS.escape(path.dataset.targetKey!)}"]`,
        );
        const matrix = path.getScreenCTM();
        if (!node || !matrix) return Infinity;
        const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
        const rect = node.getBoundingClientRect();
        return Math.hypot(end.x - rect.left - rect.width / 2, end.y - rect.top - rect.height / 2);
      }),
    );
  });
}

test("saved conversations expand tools and route tree selections across modules and resize", async () => {
  test.setTimeout(90_000);
  const output = process.env.LANCER_SCREENSHOT_DIR ?? test.info().outputPath("conversation");
  await mkdir(output, { recursive: true });
  const userDataDir = await makeUserDataDir();
  await seedLancerScreenshotUiPrefs(userDataDir);
  const agentDir = join(userDataDir, "agent");
  await seedAgentDir(agentDir, { enabledModels: [...LANCER_SCREENSHOT_ENABLED_MODELS] });
  // Deliberately invalid fixture keys: this spec never sends a provider request.
  await writeFile(
    join(agentDir, "auth.json"),
    JSON.stringify(
      Object.fromEntries(
        ["openai", "xai", "anthropic"].map((provider) => [
          provider,
          { type: "api_key", key: "SCREENSHOT_FIXTURE_NOT_A_REAL_KEY" },
        ]),
      ),
    ),
  );
  const { fixture, workspacePath, initialWorkspaces } = await makeLancerScreenshotFixture(
    agentDir,
    userDataDir,
  );
  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces,
    testMode: "background",
  });
  const appProcess = harness.electronApp.process();
  try {
    const page = await harness.firstWindow();
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
    );
    await waitForWorkspaceByPath(page, workspacePath);
    await prepareLancerScreenshotChrome(page, userDataDir, fixture);
    await selectSession(page, fixture.title);
    await waitForSelectedSessionReady(page, fixture);
    await waitForTimelineLayout(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".shell-sidebar__module-row")).toHaveCount(6);
    await expect(page.getByTestId("process-legend-item")).toHaveCount(16);
    const tree = page.getByTestId("process-tree");
    await expect(page.locator(".lhc")).toHaveCount(11);
    await expect(page.locator(".process-stage__body")).toHaveCount(0);
    await page.screenshot({ path: join(output, "01-conversation.png") });
    const stage = page.locator(".process-stage").filter({ hasText: "Read README.md" }).first();
    await stage.locator(".process-stage__head").click();
    await expect(stage).toHaveClass(/process-stage--open/);
    await waitForTimelineLayout(page);
    await stage.locator(".process-tool-step__head").first().click();
    await expect(stage.locator(".process-tool-step__output").first()).toBeVisible();
    await page.screenshot({ path: join(output, "02-tools.png") });
    await stage.locator(".process-stage__head").click();
    await expect(stage.locator(".process-stage__body")).toHaveCount(0);
    const node = tree
      .locator(`[data-event-lane="lane:${fixture.sessionId}"][data-event-type="tool"]`)
      .first();
    await node.click();
    await expect(page.locator(".process-stage--hl").first()).toBeInViewport();
    await expect.poll(() => selectionError(page)).not.toBeNull();
    await expect.poll(() => selectionError(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: join(output, "03-node-selection.png") });
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1180, 900),
    );
    await expect.poll(() => selectionError(page)).not.toBeNull();
    await expect.poll(() => selectionError(page)).toBeLessThanOrEqual(1);
    const columns = await page
      .locator(".lhc")
      .evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().width));
    expect(columns.every((width) => width >= 90)).toBe(true);
    await page.screenshot({ path: join(output, "04-narrow.png") });
    const composer = page.getByTestId("composer");
    await composer.fill("保留这份调研草稿");
    for (const sibling of fixture.siblingSessions) {
      await tree.locator(`[data-event-lane="lane:${sibling.sessionId}"]`).first().click();
      await waitForSelectedSessionReady(page, sibling);
      await expect(page.locator('[data-testid="process-session-row"].on')).toContainText(
        sibling.title,
      );
      await expect(composer).not.toHaveValue("保留这份调研草稿");
    }
    await selectSession(page, fixture.title);
    await expect(composer).toHaveValue("保留这份调研草稿");
    await writeFile(
      join(output, "evidence.json"),
      JSON.stringify(
        {
          provenance: "saved fixture conversations in isolated Electron; no provider execution",
          columns,
          pid: appProcess.pid,
          workspacePath,
          checks: [
            "tool expansion",
            "node selection",
            "one-pixel SVG landing",
            "resize",
            "cross-module navigation",
            "draft restoration",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await harness.close();
  }
});
