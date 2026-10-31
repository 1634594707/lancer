import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  seedBranchedTreeSessionFixture,
  seedProcessTimelineDemoFixture,
  selectSession,
} from "../helpers/electron-app";

test("long historical trees cross the real preload bridge and remain visible beside other sessions", async () => {
  const profile = await makeUserDataDir(),
    agentDir = join(profile, "agent"),
    workspace = await makeWorkspace("deep-session-trees");
  await seedAgentDir(agentDir, { withOpenAiAuth: false });
  await writeFile(join(profile, "ui-state.json"), JSON.stringify({ language: "en" }));
  await seedProcessTimelineDemoFixture(agentDir, workspace);
  const deep = await seedBranchedTreeSessionFixture(agentDir, workspace, { detailCount: 650 });
  const harness = await launchDesktop(profile, {
    agentDir,
    initialWorkspaces: [workspace],
    scrubProviderEnv: true,
  });
  try {
    const page = await harness.firstWindow();
    await selectSession(page, deep.title);
    // 1,300+ ancestors used to fail contextBridge's 1,000 object-nesting limit.
    await expect(
      page.getByRole("button", { name: "提交/保存 · Beta detail answer 650", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".conversation-tree-error")).toHaveCount(0);
    expect(await page.locator("[data-tree-rail]").count()).toBeGreaterThan(1);
    expect(await page.locator("[data-event-id]").count()).toBeGreaterThan(1_300);
    await page.screenshot({ path: test.info().outputPath("deep-trees.png") });
    const viewport = page.getByTestId("process-tree");
    expect(await viewport.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(
      10_000,
    );
    await viewport.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0);
    expect(await page.locator("[data-branch-rail]").count()).toBeGreaterThan(0);
    await page.screenshot({ path: test.info().outputPath("branch-start.png") });
    const horizontal = page.locator(".process-tree-scroll");
    expect(await horizontal.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
    await horizontal.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await expect.poll(() => horizontal.evaluate((el) => el.scrollLeft)).toBe(0);
    await horizontal.evaluate((el) => {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    });
    await expect(page.getByTestId("process-global-flow")).toBeInViewport();
    await page.locator(".fbar").hover();
    await expect(page.locator(".fbar .r")).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath("fixed-scroll-middle.png") });
    await horizontal.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect.poll(() => horizontal.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await expect(page.getByTestId("process-global-flow")).toBeInViewport();
    await page.locator(".fbar").hover();
    await expect(page.locator(".fbar .r")).toBeInViewport();
    await page.getByTestId("process-global-flow").click();
    await expect(page.getByTestId("process-global-flow")).toHaveAttribute("aria-pressed", "true");
    expect(await page.locator("[data-tree-rail]").count()).toBeGreaterThan(1);
    await expect(page.getByTestId("thread-title")).toHaveText(deep.title);
    await page.locator(".lhc").last().click();
    await expect(page.getByTestId("process-global-flow")).toBeInViewport();
    await page.locator(".fbar").hover();
    await expect(page.locator(".fbar .r")).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath("fixed-scroll-right.png") });
  } finally {
    await harness.close();
  }
});
