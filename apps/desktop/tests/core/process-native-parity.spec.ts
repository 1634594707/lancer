import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  LANCER_SCREENSHOT_ENABLED_MODELS,
  clickSession,
  launchDesktop,
  makeUserDataDir,
  seedAgentDir,
  seedLancerScreenshotUiPrefs,
  selectSession,
  waitForSelectedSessionReady,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";
import { makeLancerScreenshotFixture } from "../helpers/lancer-screenshot-fixture";

test("native light conversation retains reference chrome with real session controls", async () => {
  const output = resolve(process.env.LANCER_NATIVE_OUTPUT ?? test.info().outputPath("native"));
  await mkdir(output, { recursive: true });
  const profile = await makeUserDataDir();
  await seedLancerScreenshotUiPrefs(profile);
  const agentDir = join(profile, "agent");
  await seedAgentDir(agentDir, {
    withOpenAiAuth: true,
    enabledModels: [...LANCER_SCREENSHOT_ENABLED_MODELS],
  });
  const { fixture, workspacePath, initialWorkspaces } = await makeLancerScreenshotFixture(
    agentDir,
    profile,
  );
  const harness = await launchDesktop(profile, {
    agentDir,
    initialWorkspaces,
    scrubProviderEnv: true,
  });
  const appProcess = harness.electronApp.process();
  try {
    const page = await harness.firstWindow();
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
    );
    await waitForWorkspaceByPath(page, workspacePath);
    await selectSession(page, fixture.title);
    await waitForSelectedSessionReady(page, fixture);
    await expect(page.getByTestId("lancer-process-surface")).toHaveAttribute(
      "data-provenance",
      "native-session",
    );
    const active = page.locator('.model-catalog__families button[aria-pressed="true"]');
    const activeVisible = () =>
      active.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const strip = el.parentElement!.getBoundingClientRect();
        return r.left >= strip.left && r.right <= strip.right;
      });
    await expect.poll(activeVisible).toBe(true);
    await expect(
      page.getByLabel("模型图标预览").getByRole("button", { name: "Gemini", exact: true }),
    ).toBeVisible();
    const composer = page.getByTestId("composer");
    await composer.fill("保留这份草稿：界面复刻验收");
    await expect(page.locator("footer.composer")).toHaveCSS("border-top-width", "0px");
    await expect(page.getByTestId("composer-surface")).toHaveCSS("border-top-width", "1px");
    const metrics = await page.evaluate(() => {
      const rect = (selector: string) => {
        const el = document.querySelector(selector)!;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        titlebar: rect(".tbar"),
        sidebar: rect(".side"),
        tree: rect(".rp2"),
        composer: rect(".composer__surface"),
        activeModel: rect('.model-catalog__families button[aria-pressed="true"]'),
        nativeWindow: document.querySelector(".lancer-process")?.getAttribute("data-native-window"),
      };
    });
    expect(metrics.titlebar.height).toBe(44);
    expect(metrics.sidebar.width).toBe(288);
    expect(metrics.tree.width).toBe(452);
    expect(metrics.composer.width).toBe(644);
    expect(metrics.composer.height).toBeLessThanOrEqual(72);
    if (metrics.nativeWindow === "darwin")
      await expect(page.locator(".tdots")).toHaveCSS("visibility", "hidden");
    // Default spacing stays readable even for many neighboring histories.
    await expect(page.locator('[data-overview="false"]')).toBeVisible();
    const laneGaps = await page.locator("[data-event-lane]").evaluateAll((nodes) => {
      const lanes = new Map<string, number[]>();
      for (const node of nodes) {
        const lane = node.getAttribute("data-event-lane")!;
        const ys = lanes.get(lane) ?? [];
        ys.push((node as HTMLElement).offsetTop);
        lanes.set(lane, ys);
      }
      return [...lanes.values()].flatMap((ys) =>
        ys
          .sort((a, b) => a - b)
          .slice(1)
          .map((y, i) => y - ys[i]!),
      );
    });
    expect(laneGaps.length).toBeGreaterThan(10);
    expect(Math.min(...laneGaps)).toBeGreaterThanOrEqual(31);
    await page.getByRole("button", { name: "总览", exact: true }).click();
    await page.screenshot({ path: join(output, "native-1440.png") });
    await writeFile(join(output, "geometry.json"), JSON.stringify(metrics, null, 2));
    // The richer family preview remains visible after resize, and keeps the draft.
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1480, 980),
    );
    await expect.poll(activeVisible).toBe(true);
    await expect(composer).toHaveValue("保留这份草稿：界面复刻验收");
    await page.screenshot({ path: join(output, "native-1480.png") });
    const sibling = fixture.siblingSessions[0]!;
    await clickSession(page, sibling.title);
    await expect(page.getByTestId("thread-title")).toContainText(sibling.title);
    await clickSession(page, fixture.title);
    await expect(composer).toHaveValue("保留这份草稿：界面复刻验收");
  } finally {
    await harness.close();
    await writeFile(
      join(output, "cleanup.json"),
      JSON.stringify({ pid: appProcess.pid, exitCode: appProcess.exitCode }),
    );
  }
});
