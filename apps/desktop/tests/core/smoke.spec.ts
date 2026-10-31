import { basename } from "node:path";
import { expect, test } from "@playwright/test";
import {
  addWorkspaceViaIpc,
  getDesktopState,
  getSelectedTranscript,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("adds a workspace to an empty launched app", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("launch-diagnostic-workspace");
  const harness = await launchDesktop(userDataDir, { testMode: "background" });

  try {
    const window = await harness.firstWindow();
    await expect.poll(async () => (await getDesktopState(window)).workspaces).toEqual([]);

    await addWorkspaceViaIpc(window, workspacePath);

    const workspace = await waitForWorkspaceByPath(window, workspacePath);
    await openNewThread(window);
    await expect(window.getByRole("combobox", { name: "Workspace", exact: true })).toHaveValue(
      workspace.id,
    );
  } finally {
    await harness.close();
  }
});

test("boots an existing workspace and starts a new thread through the real UI", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("core-smoke-workspace");
  const promptText = "Smoke test thread";
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();

    await waitForWorkspaceByPath(window, workspacePath);
    await openNewThread(window);
    await expect(
      window.getByRole("combobox", { name: "Workspace", exact: true }).locator("option:checked"),
    ).toHaveText(basename(workspacePath));
    await window
      .getByRole("complementary")
      .getByRole("button", { name: "New thread", exact: true })
      .click();

    const prompt = window.getByLabel("New thread prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toBeFocused();
    await expect(window.getByRole("heading", { name: "Let's build" })).toHaveCount(0);
    await prompt.fill(promptText);

    await window.getByRole("button", { name: "Start thread" }).click();

    await expect(window.getByTestId("thread-title")).toHaveText(/\S+/);
    await expect(window.getByTestId("composer")).toBeFocused();
    await expect
      .poll(
        async () => {
          const transcript = await getSelectedTranscript(window);
          const userMessage = transcript?.transcript.find(
            (entry): entry is Extract<typeof entry, { kind: "message" }> =>
              entry.kind === "message" && entry.role === "user",
          );
          return userMessage?.text ?? "";
        },
        { timeout: 15_000 },
      )
      .toContain(promptText);
    await expect(window.getByTestId("transcript")).toContainText(promptText);
  } finally {
    await harness.close();
  }
});

test("new conversations use the workspace selected in the composer", async () => {
  const userDataDir = await makeUserDataDir();
  const firstPath = await makeWorkspace("first-workspace");
  const secondPath = await makeWorkspace("second-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [firstPath, secondPath],
    testMode: "background",
  });
  try {
    const window = await harness.firstWindow();
    const second = await waitForWorkspaceByPath(window, secondPath);
    await openNewThread(window);
    await window.getByRole("combobox", { name: "Workspace", exact: true }).selectOption(second.id);
    await window.getByLabel("New thread prompt").fill("Work in the selected project");
    await window.getByRole("button", { name: "Start thread", exact: true }).click();
    await expect(window.getByTestId("transcript")).toContainText("Work in the selected project");
    await expect
      .poll(async () => (await getDesktopState(window)).selectedWorkspaceId)
      .toBe(second.id);
    const state = await getDesktopState(window);
    expect(
      state.workspaces.find((workspace) => workspace.path === firstPath)?.sessions,
    ).toHaveLength(0);
    expect(state.workspaces.find((workspace) => workspace.id === second.id)?.sessions).toHaveLength(
      1,
    );
  } finally {
    await harness.close();
  }
});
