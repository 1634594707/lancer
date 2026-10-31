import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { launchDesktop } from "../helpers/electron-app";

test("records persisted real trees with horizontal overview and focused forks", async () => {
  test.setTimeout(120_000);
  const profile = process.env.LANCER_RECORDING_PROFILE;
  const proofPath = process.env.LANCER_RECORDING_PROOF;
  if (!profile || !proofPath)
    throw new Error("An existing recording profile and proof are required");
  const proof = JSON.parse(await readFile(proofPath, "utf8")) as {
    parent: string;
    roots: string[];
  };
  const harness = await launchDesktop(profile, {
    agentDir: join(profile, "agent"),
    scrubProviderEnv: true,
    envOverrides: { PI_APP_TEST_MODE: undefined },
  });
  const page = await harness.firstWindow();
  await harness.focusWindow();
  const stop = test.info().outputPath("walkthrough.stop");
  const recorder = spawn(resolve(".artifacts/full-chain-recording/window-recorder"), [
    String(harness.electronApp.process().pid),
    test.info().outputPath("06-全部工作树与分支合并回看.mp4"),
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
  try {
    await expect.poll(() => log, { timeout: 20_000 }).toContain("RECORDING_STARTED");
    await page.getByTestId("process-global-flow").click();
    const scroll = page.locator(".process-tree-scroll");
    await expect(scroll).toBeVisible();
    const box = (await scroll.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(-3000, -3000);
    await page.waitForTimeout(1200);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(230, 0);
      await page.waitForTimeout(1000);
    }
    for (const id of [proof.parent, ...proof.roots]) {
      await page.locator(`[data-session-id="${id}"] .shell-sidebar__session`).click();
      await page.getByTestId("process-focus-tree").click();
      await page.waitForTimeout(1400);
      const b = (await scroll.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.wheel(0, -3000);
      await page.waitForTimeout(1200);
      await page.mouse.wheel(0, 420);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: test.info().outputPath(`tree-${id}.png`) });
    }
    await page.getByTestId("process-global-flow").click();
    await page.waitForTimeout(1200);
  } finally {
    await writeFile(stop, "stop");
    const code = await done;
    await writeFile(test.info().outputPath("capture.log"), log);
    await harness.close();
    expect(code).toEqual([0, null]);
  }
});
