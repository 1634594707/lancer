import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  getRealAuthConfig,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForTimelineLayout,
} from "../helpers/electron-app";

test("renders a real tool call item that expands and collapses from the transcript", async () => {
  test.setTimeout(180_000);
  const realAuth = getRealAuthConfig();
  test.skip(!realAuth.enabled, realAuth.skipReason);

  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("tool-call-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
    realAuthSourceDir: realAuth.sourceDir,
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Tool test");

    const composer = window.getByTestId("composer");
    await composer.fill(
      "Use your bash or shell tool to run `pwd` before answering. After the tool finishes, reply with exactly TOOL_OK.",
    );
    await composer.press("Enter");

    await expect(window.locator(".process-assistant .tx").last()).toContainText("TOOL_OK", {
      timeout: 150_000,
    });
    const stage = window
      .locator(".process-stage")
      .filter({ hasText: /bash|shell/i })
      .first();
    await waitForTimelineLayout(window);
    await stage.locator(".process-stage__head").click();
    await waitForTimelineLayout(window);
    const toolItem = stage.locator(".process-tool-step").first();
    const toolHeader = toolItem.locator(".process-tool-step__head");
    await expect(toolHeader).toHaveAttribute("aria-expanded", "false");

    await toolHeader.click();
    await expect(toolHeader).toHaveAttribute("aria-expanded", "true");
    await expect(toolItem.locator(".process-tool-step__body")).toBeVisible();
    await expect(toolItem.locator(".process-tool-step__output")).toContainText(workspacePath);

    await toolHeader.click();
    await expect(toolHeader).toHaveAttribute("aria-expanded", "false");
    await expect(toolItem.locator(".process-tool-step__body")).toHaveCount(0);
  } finally {
    await harness.close();
  }
});
