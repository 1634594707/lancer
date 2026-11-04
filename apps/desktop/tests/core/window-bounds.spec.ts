import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
} from "../helpers/electron-app";

test("main window reopens at its last position and size", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  await seedAgentDir(agentDir);
  const workspacePath = await makeWorkspace("window-bounds-workspace");

  const firstRun = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });
  try {
    await firstRun.firstWindow();
    await firstRun.electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.setBounds({ x: 120, y: 90, width: 1024, height: 720 });
    });
    // The save is debounced; let the trailing write land before the app quits.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  } finally {
    await firstRun.close();
  }

  const secondRun = await launchDesktop(userDataDir, {
    agentDir,
    testMode: "background",
  });
  try {
    await secondRun.firstWindow();
    const bounds = await secondRun.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.getBounds(),
    );
    // Window managers may nudge the origin, but the size is ours to restore.
    expect(bounds.width).toBe(1024);
    expect(bounds.height).toBe(720);
    expect(Math.abs(bounds.x - 120)).toBeLessThanOrEqual(60);
    expect(Math.abs(bounds.y - 90)).toBeLessThanOrEqual(60);
  } finally {
    await secondRun.close();
  }
});

test("a quit inside the save debounce still persists the last bounds", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  await seedAgentDir(agentDir);
  const workspacePath = await makeWorkspace("window-bounds-flush-workspace");

  const run = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });
  let exited = false;
  run.electronApp.on("close", () => {
    exited = true;
  });
  try {
    await run.firstWindow();
    await run.electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.setBounds({ x: 140, y: 110, width: 1108, height: 736 });
    });
    // Quit well inside the 400 ms save debounce. On Windows and Linux closing
    // the last window takes the process down, so only the close-time flush can
    // persist these bounds — the debounced write would lose them.
    await new Promise((resolve) => setTimeout(resolve, 120));
    const closed = run.electronApp.waitForEvent("close");
    await run.electronApp.evaluate(({ app }) => app.quit());
    await closed;
  } finally {
    if (!exited) {
      await run.close();
    }
  }

  const saved = JSON.parse(await readFile(join(userDataDir, "window-bounds.json"), "utf8")) as {
    bounds?: { width?: number; height?: number };
  };
  expect(saved.bounds?.width).toBe(1108);
  expect(saved.bounds?.height).toBe(736);
});
