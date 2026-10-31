import { realpath } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import type { DesktopHarness } from "../helpers/electron-app";
import { openNewThread, waitForWorkspaceByPath } from "../helpers/electron-app";

export async function assertPackagedAppCanStartThread(
  harness: DesktopHarness,
  window: Page,
  options: {
    readonly expectedExecutablePath: string;
    readonly promptText: string;
    readonly workspacePath: string;
  },
): Promise<void> {
  // macOS resolves /var and bundle symlinks in process.execPath. Compare file identity
  // with the requested executable, not the spelling of its temporary directory.
  const expectedExecutablePath = await realpath(options.expectedExecutablePath);
  await expect
    .poll(async () => {
      return harness.electronApp.evaluate(() => ({
        defaultApp: Boolean(process.defaultApp),
        execPath: process.execPath,
      }));
    })
    .toEqual({
      defaultApp: false,
      execPath: expectedExecutablePath,
    });

  await waitForWorkspaceByPath(window, options.workspacePath);
  await openNewThread(window);
  const prompt = window.getByLabel("New thread prompt");
  await expect(prompt).toBeVisible();
  await prompt.fill(options.promptText);
  await window.getByRole("button", { name: "Start thread" }).click();

  await expect(window.getByTestId("composer")).toBeFocused();
  await expect(window.getByTestId("transcript")).toContainText(options.promptText);
}
