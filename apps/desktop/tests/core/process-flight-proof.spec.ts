import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { REPLAY_FIXTURE } from "../../src/features/conversation/lancer-process/replay-fixture";
import { auditProcessCurves } from "../helpers/process-curve-audit";
import {
  writeCurveEvidence,
  writeCurveZoom,
  type CurveFrameRecord,
} from "../helpers/process-curve-evidence";
import {
  launchDesktop,
  makeUserDataDir,
  seedLancerScreenshotUiPrefs,
} from "../helpers/electron-app";

test("original replay flight paints a head on its semantic tree anchor", async () => {
  const output = resolve(process.env.LANCER_CURVE_OUTPUT ?? test.info().outputPath("flight-proof"));
  await mkdir(output, { recursive: true });
  const profile = await makeUserDataDir();
  await seedLancerScreenshotUiPrefs(profile);
  const harness = await launchDesktop(profile, { testMode: "background", scrubProviderEnv: true });
  const appProcess = harness.electronApp.process();
  const frames: CurveFrameRecord[] = [];
  const zooms = new Map<string, string>();
  try {
    const page = await harness.firstWindow();
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
    );
    const url = new URL(page.url());
    url.searchParams.set("lancer-replay", "r8");
    await page.goto(url.toString());
    await page.waitForFunction(() => Boolean(window.lancerReplay));
    await page.evaluate(() => document.fonts.ready);
    // The scripted 41/43.5/47s global views are useful context, but the visible
    // chat flight is earlier. Sample both transit and landing, not just endpoints.
    for (const seconds of [4.25, 4.745, 13.7, 41, 43.5, 47]) {
      const state = await page.evaluate((s) => window.lancerReplay!.seek(s), seconds);
      const audit = await page.evaluate(auditProcessCurves, {
        events: REPLAY_FIXTURE.events,
        time: state.time,
        emissions: true,
        traceSelection: false,
      });
      frames.push({ ...audit, scenario: "script", seconds, index: frames.length });
      expect(audit.failures).toEqual([]);
      const image = await page.screenshot({ path: join(output, `${seconds}.png`) });
      for (const hit of audit.hits.filter((hit) => hit.id.startsWith("flight:"))) {
        const directory = `zoom-${seconds}`;
        const filename = await writeCurveZoom(join(output, directory), image, hit, seconds);
        zooms.set(`${hit.id}@${seconds}`, `../${directory}/${filename}`);
      }
      if (seconds === 4.25) {
        const hit = audit.hits.find((hit) => hit.id === "flight:ev12:chat");
        expect(hit).toBeDefined();
        expect(hit!.landingError).toBeNull();
        await expect(page.locator('[data-flight-head="flight:ev12:chat"]')).toBeVisible();
      }
      if (seconds === 4.745) {
        const hit = audit.hits.find((hit) => hit.id === "flight:ev12:chat");
        expect(hit).toBeDefined();
        expect(hit!.landingError).not.toBeNull();
        expect(hit!.landingError!).toBeLessThanOrEqual(1);
        await expect(page.locator('[data-flight-head="flight:ev12:chat"]')).toBeVisible();
      }
    }
    expect(frames.some((frame) => frame.hits.some((hit) => hit.id.startsWith("flight:")))).toBe(
      true,
    );
  } finally {
    await writeCurveEvidence(output, frames, zooms);
    await harness.close();
    await writeFile(
      join(output, "curve-cleanup.json"),
      JSON.stringify(
        {
          pid: appProcess.pid,
          exitCode: appProcess.exitCode,
          frames: frames.length,
        },
        null,
        2,
      ),
    );
  }
});
