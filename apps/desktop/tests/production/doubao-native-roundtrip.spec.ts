import { expect, test } from "@playwright/test";
import { join } from "node:path";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
  seedAgentDir,
} from "../helpers/electron-app";

// Explicit opt-in: this sends one message to the currently open native Doubao
// conversation. No mocked helper, provider response, or injected transcript.
test("native Doubao accepts one Lancer message and returns its reply in order", async () => {
  test.skip(process.env.PI_APP_NATIVE_DOUBAO !== "1", "Requires an unlocked native Doubao App");
  test.setTimeout(120_000);
  const title = process.env.PI_APP_DOUBAO_EXPECTED_TITLE;
  if (!title) throw new Error("Set PI_APP_DOUBAO_EXPECTED_TITLE to the intended conversation");
  const profile = await makeUserDataDir();
  const workspace = await makeWorkspace("doubao-native-roundtrip");
  const agentDir = join(profile, "agent");
  await seedAgentDir(agentDir, { withOpenAiAuth: false, withDefaultModel: false });
  const harness = await launchDesktop(profile, {
    agentDir,
    initialWorkspaces: [workspace],
    testMode: "foreground",
    scrubProviderEnv: true,
    envOverrides: { PI_APP_DOUBAO_HELPER_PATH: undefined },
  });
  try {
    const page = await harness.firstWindow();
    await harness.focusWindow();
    await openNewThread(page);
    await page.locator(".new-thread__hint .model-selector__badge").first().click();
    await page.getByTestId("choose-doubao-app").click();
    const transcript = page.getByTestId("doubao-app-transcript");
    await transcript.locator(".doubao-app-connection > summary").click();
    await expect(transcript.locator(".doubao-app-connection")).toContainText(title);
    await transcript.locator(".doubao-app-connection > summary").click();
    const replies = transcript.locator(".doubao-app-message--assistant");
    const before = await replies.count();
    const request = "我们验证一下修复后的连接。请只回复：会话连接正常，可以继续核对视频交付。";
    await page.getByTestId("doubao-app-composer").fill(request);
    await page.getByTestId("doubao-app-send").click();
    // Do not activate another app while the bridge owns native input focus.
    await expect(page.getByTestId("doubao-app-composer")).toHaveValue("", { timeout: 25_000 });
    await expect(transcript.locator(".doubao-app-message--user").last()).toHaveText(request);
    await expect(replies).toHaveCount(before + 1, { timeout: 90_000 });
    await expect(replies.last()).toContainText("会话连接正常，可以继续核对视频交付");
    await expect(transcript.getByRole("alert")).toHaveCount(0);
    await harness.focusWindow();
    await page.screenshot({ path: test.info().outputPath("native-roundtrip.png") });
    await page.reload();
    await expect(replies).toHaveCount(before + 1);
    await expect(replies.last()).toContainText("会话连接正常，可以继续核对视频交付");
  } finally {
    await harness.close();
  }
});
