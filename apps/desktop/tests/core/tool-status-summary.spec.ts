import { expect, test } from "@playwright/test";
import { join } from "node:path";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  seedToolResultTreeSessionFixture,
  selectSession,
  waitForSelectedSessionReady,
  waitForTimelineLayout,
} from "../helpers/electron-app";

test("failed shell output is not labelled exit zero in the expanded conversation", async () => {
  const profile = await makeUserDataDir();
  const agentDir = join(profile, "agent");
  const workspace = await makeWorkspace("tool-status");
  await seedAgentDir(agentDir, { withOpenAiAuth: false });
  const fixture = await seedToolResultTreeSessionFixture(agentDir, workspace, true);
  const harness = await launchDesktop(profile, {
    agentDir,
    initialWorkspaces: [workspace],
    scrubProviderEnv: true,
  });
  try {
    const page = await harness.firstWindow();
    await selectSession(page, fixture.title);
    await waitForSelectedSessionReady(page, fixture);
    await waitForTimelineLayout(page);
    const group = page
      .locator(".process-stage")
      .filter({ has: page.locator(".process-stage__status--error") });
    await expect(group).toHaveCount(1);
    await group.locator(".process-stage__head").click();
    const step = group.locator(".process-tool-step--error .process-tool-step__summary");
    await expect(step).toContainText("exit 1");
    await expect(group).not.toContainText("exit 0");
    await page.screenshot({ path: test.info().outputPath("correct-shell-status.png") });
  } finally {
    await harness.close();
  }
});
