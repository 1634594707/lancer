import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  getDesktopState,
  getRealAuthConfig,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  initGitRepo,
  commitAllInGitRepo,
  openNewThread,
} from "../helpers/electron-app";
import { finishLiveFlightCapture, startLiveFlightCapture } from "../helpers/live-flight-capture";

test("visible real-provider conversation emits the original flight and landing", async () => {
  test.setTimeout(180_000);
  const auth = getRealAuthConfig();
  test.skip(!auth.enabled, auth.skipReason);
  const provider = process.env.PI_GUI_PROVIDER;
  const model = process.env.PI_GUI_MODEL;
  if (!provider || !model)
    throw new Error("Set PI_GUI_PROVIDER and PI_GUI_MODEL to a configured model");
  const profile = await makeUserDataDir();
  const workspace = await makeWorkspace("provider-live-flight");
  await writeFile(
    join(profile, "ui-state.json"),
    JSON.stringify({ themeMode: "light", language: "en" }),
  );
  await initGitRepo(workspace);
  await writeFile(join(workspace, "README.md"), "Flight verification\n");
  await commitAllInGitRepo(workspace, "Initial verification workspace");
  const launch = () =>
    launchDesktop(profile, {
      initialWorkspaces: [workspace],
      realAuthSourceDir: auth.sourceDir,
      enabledModels: [`${provider}/${model}`],
      scrubProviderEnv: true,
      envOverrides: { PI_APP_TEST_MODE: undefined },
    });
  let harness = await launch();
  const appProcess = harness.electronApp.process();
  try {
    await harness.focusWindow();
    const page = await harness.firstWindow();
    const doctor = await harness.electronApp.evaluate(({ app, BrowserWindow }, url) => {
      const window = BrowserWindow.getAllWindows().find(
        (entry) => entry.webContents.getURL() === url,
      );
      return {
        appPath: app.getAppPath(),
        userData: app.getPath("userData"),
        pid: process.pid,
        visible: window?.isVisible(),
        focused: window?.isFocused(),
        testMode: process.env.PI_APP_TEST_MODE ?? null,
        testHooks: "__PI_APP_TEST_HOOKS" in globalThis,
      };
    }, page.url());
    await writeFile(test.info().outputPath("doctor.json"), JSON.stringify(doctor, null, 2));
    expect(doctor.appPath).toBe(process.cwd() + "/apps/desktop");
    expect(doctor.userData).toBe(profile);
    expect(doctor.visible).toBe(true);
    expect(doctor.focused).toBe(true);
    expect(doctor.testMode).toBeNull();
    expect(doctor.testHooks).toBe(false);
    expect(await page.evaluate(() => document.hasFocus())).toBe(true);
    await openNewThread(page);
    await page
      .getByLabel("New thread prompt")
      .fill("Reply with only LIVE_FLIGHT_READY. Do not use tools.");
    await page.getByRole("button", { name: "Start thread", exact: true }).click();
    await expect(page.getByTestId("composer")).toBeVisible();
    await expect(page.locator(".process-assistant").last()).toContainText("LIVE_FLIGHT_READY", {
      timeout: 120_000,
    });
    const idle = () =>
      expect
        .poll(
          async () => {
            const state = await getDesktopState(page);
            return state.workspaces
              .flatMap((w) => w.sessions)
              .find((s) => s.id === state.selectedSessionId)?.status;
          },
          { timeout: 120_000 },
        )
        .toBe("idle");
    await idle();
    await expect(page.locator("[data-flight-head], [data-flight-landing]")).toHaveCount(0);
    await startLiveFlightCapture(page);
    await page
      .getByTestId("composer")
      .fill("Reply with only LIVE_FLIGHT_CONFIRMED. Do not use tools.");
    await page.getByTestId("send").click();
    await expect
      .poll(() => page.locator("[data-flight-head]").count(), { intervals: [10] })
      .toBeGreaterThan(0);
    await page.screenshot({ path: test.info().outputPath("real-live-flight.png") });
    await expect(page.locator(".process-assistant").last()).toContainText("LIVE_FLIGHT_CONFIRMED", {
      timeout: 120_000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.liveFlightCapture?.flights.some((frame) => frame.source.startsWith("family:")),
          ),
        { intervals: [10] },
      )
      .toBe(true);
    // A short response can land while Playwright captures the first screenshot.
    // Assert its recorded painted frames instead of racing a second live DOM lookup.
    await page.screenshot({ path: test.info().outputPath("real-live-chat-delivered.png") });
    await idle();
    await expect(page.locator("[data-flight-head], [data-flight-landing]")).toHaveCount(0);
    const capture = await finishLiveFlightCapture(page, "family:");
    await writeFile(
      test.info().outputPath("real-live-flight.json"),
      JSON.stringify({ provider, model, ...capture }, null, 2),
    );
    await page.screenshot({ path: test.info().outputPath("real-live-complete.png") });
    await page
      .getByTestId("composer")
      .fill(
        "Use the write tool to create delivery.txt containing exactly DELIVERY_NODE_42. Then reply DELIVERED.",
      );
    await page.getByTestId("send").click();
    await expect(page.getByTestId("turn-changes")).toContainText("delivery.txt", {
      timeout: 120_000,
    });
    await idle();
    await expect(
      page.getByTestId("process-tree").getByRole("button", { name: /产物 · 文件交付/ }),
    ).toHaveCount(1);
    await harness.close();
    harness = await launch();
    const restored = await harness.firstWindow();
    await expect(restored.getByTestId("turn-changes")).toContainText("delivery.txt");
    await expect(
      restored.getByTestId("process-tree").getByRole("button", { name: /产物 · 文件交付/ }),
    ).toHaveCount(1);
    await restored.screenshot({ path: test.info().outputPath("delivery-after-restart.png") });
  } finally {
    await harness.close();
    await writeFile(
      test.info().outputPath("cleanup.json"),
      JSON.stringify({
        pid: appProcess.pid,
        exitCode: appProcess.exitCode,
      }),
    );
  }
});
