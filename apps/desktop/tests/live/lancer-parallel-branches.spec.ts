import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  getDesktopState,
  getRealAuthConfig,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
} from "../helpers/electron-app";

test("real provider runs two branches concurrently and returns saved results to the parent", async () => {
  test.setTimeout(240_000);
  const auth = getRealAuthConfig();
  test.skip(!auth.enabled, auth.skipReason);
  const provider = process.env.PI_GUI_PROVIDER,
    model = process.env.PI_GUI_MODEL;
  if (!provider || !model) throw new Error("A configured provider and model are required");
  const profile = await makeUserDataDir(),
    workspace = await makeWorkspace("real-branches");
  await writeFile(
    join(profile, "ui-state.json"),
    JSON.stringify({ language: "en", themeMode: "light" }),
  );
  const harness = await launchDesktop(profile, {
    initialWorkspaces: [workspace],
    realAuthSourceDir: auth.sourceDir,
    enabledModels: [`${provider}/${model}`],
    scrubProviderEnv: true,
    envOverrides: { PI_APP_TEST_MODE: undefined },
  });
  try {
    await harness.focusWindow();
    const page = await harness.firstWindow();
    const doctor = await harness.electronApp.evaluate(({ BrowserWindow }) => ({
      testMode: process.env.PI_APP_TEST_MODE ?? null,
      testHooks: "__PI_APP_TEST_HOOKS" in globalThis,
      visible: BrowserWindow.getAllWindows()[0]?.isVisible(),
    }));
    expect(doctor).toEqual({ testMode: null, testHooks: false, visible: true });
    await openNewThread(page);
    await page
      .getByLabel("New thread prompt")
      .fill(
        "Reply only PARENT_READY. Later acknowledge worker reports without using tools or starting new tasks.",
      );
    await page.getByRole("button", { name: "Start thread", exact: true }).click();
    await expect(page.locator(".process-assistant").last()).toContainText("PARENT_READY", {
      timeout: 120_000,
    });
    await expect(page.getByTestId("send")).not.toHaveAttribute("aria-label", "Stop run");
    const parent = await getDesktopState(page);
    await page.getByTestId("composer").fill("Keep this draft while branches return");
    await page.getByTestId("launch-parallel-tasks").click();
    for (const [i, tag] of ["A", "B"].entries()) {
      const script = `import time, pathlib\np = pathlib.Path(${JSON.stringify(workspace)})\nprint('CLI_${tag}_START', flush=True)\nfor i in range(480):\n print('CLI_${tag}_LINE_' + str(i), flush=True)\n if (p / 'release-workers').exists(): break\n time.sleep(0.25)\n(p / '${tag}.txt').write_text('DELIVERED_${tag}')\nprint('CLI_${tag}_END', flush=True)`;
      await page
        .getByLabel(`任务 ${i + 1}`, { exact: true })
        .fill(
          `Worker ${tag}: use your bash tool once to run exactly this command, then reply only DELIVERED_${tag}. Do not create other tasks.\npython3 -u - <<'PY'\n${script}\nPY`,
        );
    }
    await page.getByRole("button", { name: "并行开始", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await getDesktopState(page)).orchestrationChildren.filter((c) => c.status === "running")
            .length,
        { timeout: 60_000 },
      )
      .toBe(2);
    const orb = harness.electronApp.windows().find((p) => p.url().includes("pi-orb.html"))!;
    await orb.locator(".pi-orb").click();
    await expect(orb.locator(".pi-panel")).not.toHaveClass(/closed/);
    await expect.poll(() => orb.evaluate(() => innerWidth)).toBe(740);
    await expect(orb.locator(".pane")).toHaveCount(3);
    await harness.focusWindow();
    for (const tag of ["A", "B"]) {
      await expect
        .poll(
          () =>
            orb
              .locator("textarea.log")
              .evaluateAll((nodes) =>
                nodes.map((n) => (n as HTMLTextAreaElement).value).join("\n"),
              ),
          { timeout: 60_000 },
        )
        .toMatch(new RegExp(`(?:^|\n)CLI_${tag}_LINE_\\d+(?:\n|$)`));
    }
    const running = await getDesktopState(page);
    expect(running.orchestrationChildren.every((c) => c.status === "running")).toBe(true);
    expect(new Set(running.orchestrationChildren.map((c) => c.childSessionId)).size).toBe(2);
    await expect(orb.locator(".pi-panel")).not.toHaveClass(/closed/);
    await expect.poll(() => orb.evaluate(() => innerWidth)).toBe(740);
    await orb.screenshot({ path: test.info().outputPath("real-provider-multiple-cli.png") });
    await orb.getByLabel("收起", { exact: true }).click();
    await writeFile(join(workspace, "release-workers"), "continue");
    for (const tag of ["A", "B"]) {
      await expect
        .poll(() => readFile(join(workspace, `${tag}.txt`), "utf8").catch(() => ""), {
          timeout: 60_000,
        })
        .toBe(`DELIVERED_${tag}`);
    }
    await expect
      .poll(
        async () =>
          (await getDesktopState(page)).orchestrationChildren.flatMap((c) =>
            c.evidence.filter(
              (e) => e.toolName === "lancer-branch-return" && e.status === "accepted",
            ),
          ).length,
        { timeout: 120_000 },
      )
      .toBe(2);
    await expect(page.locator('[data-event-type="merge"]')).toHaveCount(2);
    expect((await getDesktopState(page)).selectedSessionId).toBe(parent.selectedSessionId);
    await expect(page.getByTestId("composer")).toHaveValue("Keep this draft while branches return");
    await page.screenshot({ path: test.info().outputPath("real-provider-saved-joins.png") });
    await writeFile(
      test.info().outputPath("proof.json"),
      JSON.stringify(
        {
          provider,
          model,
          doctor,
          concurrentChildren: running.orchestrationChildren.map((c) => c.childSessionId),
          returned: 2,
          files: ["DELIVERED_A", "DELIVERED_B"],
        },
        null,
        2,
      ),
    );
  } finally {
    await harness.close();
  }
});
