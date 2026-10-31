import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  seedLancerScreenshotUiPrefs,
} from "../helpers/electron-app";

test("light process surface replays video learning, research and global flow with live anchors", async () => {
  test.setTimeout(180_000);
  const output = process.env.LANCER_REPLAY_OUTPUT ?? test.info().outputPath("replay");
  await mkdir(join(output, "lancer-frames"), { recursive: true });
  const profile = await makeUserDataDir();
  await seedLancerScreenshotUiPrefs(profile);
  const harness = await launchDesktop(profile, {
    testMode: "background",
    scrubProviderEnv: true,
    disableGpu: process.env.LANCER_REPLAY_STABLE === "1",
  });
  const appProcess = harness.electronApp.process();
  const pid = appProcess.pid;
  try {
    const page = await harness.firstWindow();
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
    );
    const original = await getDesktopState(page);
    const url = new URL(page.url());
    url.searchParams.set("lancer-replay", "r8");
    await page.goto(url.toString());
    await page.waitForFunction(() => Boolean(window.lancerReplay));
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId("lancer-process-surface")).toHaveAttribute(
      "data-provenance",
      "scripted-fixture",
    );
    // Modules show their own conversation list; the tree keeps every parallel line.
    await expect(page.getByTestId("process-session-row")).toHaveCount(4);
    await expect(page.getByTestId("process-legend-item")).toHaveCount(16);
    const captures =
      process.env.LANCER_REPLAY_ALL_FRAMES === "1"
        ? Array.from({ length: 112 }, (_, i) => i)
        : [0, 1, 10, 28, 36, 46, 60, 61, 62, 63, 70, 82, 90, 100, 102, 110];
    const measurements: unknown[] = [];
    for (const index of captures) {
      const state = await page.evaluate(
        async (seconds) => window.lancerReplay!.seek(seconds),
        index / 2,
      );
      await page.screenshot({
        path: join(output, "lancer-frames", `${String(index).padStart(3, "0")}.png`),
        animations: process.env.LANCER_REPLAY_STABLE === "1" ? "disabled" : "allow",
        caret: "hide",
      });
      const geometry = await page.evaluate(() => {
        const selectors = [
          ".tbar",
          ".side",
          ".strip4",
          ".cvh",
          ".cmp",
          ".composer",
          ".foot",
          ".lh",
          ".fbar",
          ".process-tree-viewport",
          ".model-reel__chip--active",
        ];
        return Object.fromEntries(
          selectors.map((selector) => {
            const el = document.querySelector(selector)!;
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return [
              selector,
              {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                font: s.font,
                lineHeight: s.lineHeight,
              },
            ];
          }),
        );
      });
      measurements.push({ ...state, geometry });
      if ([61, 62, 63, 102].includes(index))
        expect(state.anchorClamped, `reading position reachable at ${index / 2}s`).toBe(false);
      if (state.anchorError !== null && !state.anchorClamped)
        expect(Math.abs(state.anchorError), `reading anchor at ${index / 2}s`).toBeLessThanOrEqual(
          1,
        );
      if (index === 0) {
        await expect(page.locator(".lancer-process--blank")).toHaveCount(0);
        await expect(page.getByTestId("thread-title")).toBeVisible();
        await expect(page.locator(".process-assistant").first()).toContainText("收到");
      }
      if (index === 63) {
        await expect(
          page.locator('[data-process-id="ev37"] .srw').filter({ hasText: "spring.ts" }),
        ).toBeVisible();
        await expect(page.locator('[data-process-id="ev37"] .sdt')).toHaveCount(0);
      }
    }
    await page.evaluate(() => window.lancerReplay!.seek(18));
    await expect(page.locator(".sdt").filter({ hasText: "ffmpeg -i" })).toBeVisible();
    await page.evaluate(() => window.lancerReplay!.seek(35));
    await expect(page.locator(".sdt").filter({ hasText: "12 total" })).toBeVisible();
    await page.getByTestId("process-global-flow").click();
    await expect(page.locator(".cvh")).toContainText("全部会话");
    await page.locator('[data-event-id="ev37"]').click();
    await expect(page.locator('[data-chat-anchor="ev37"]')).toBeVisible();
    await expect
      .poll(async () => page.getByTestId("process-curves").getAttribute("data-endpoints"))
      .toContain('"id":"ev37"');
    await page.locator('[data-event-id="ev37"]').hover();
    const tip = page.locator(".process-event-tip");
    await expect(tip).toBeVisible();
    const treeBox = (await page.getByTestId("process-tree").boundingBox())!;
    expect(Math.abs((await tip.boundingBox())!.x - (treeBox.x - 252))).toBeLessThanOrEqual(1);
    await page.locator(".shell-sidebar__brand").hover();
    await expect(tip).toHaveCount(0);
    await expect(page.locator(".process-tree-space .nl")).toHaveCount(0);
    await page.locator('[data-event-id="ev37"]').blur();
    await page.locator('[data-event-id="ev37"]').focus();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.screenshot({ path: join(output, "nodes-only-tooltip.png") });
    await page.locator('[data-event-id="ev37"]').blur();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    const after = await getDesktopState(page);
    expect(after.workspaces).toEqual(original.workspaces);
    expect(after.selectedSessionId).toEqual(original.selectedSessionId);
    await writeFile(
      join(output, "replay-measurements.json"),
      JSON.stringify(measurements, null, 2),
    );
  } finally {
    await harness.close();
    await writeFile(
      join(output, "replay-cleanup.json"),
      JSON.stringify(
        {
          pid,
          exitCode: appProcess.exitCode,
          evidence: "isolated development Electron, read-only renderer replay",
        },
        null,
        2,
      ),
    );
  }
});
