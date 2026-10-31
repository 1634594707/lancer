import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { launchDesktopByExecutable } from "../helpers/electron-app";

test("receive actual Doubao exports in the installed Lancer conversation", async () => {
  test.setTimeout(300_000);
  const profile = process.env.LANCER_RECORDING_PROFILE;
  if (!profile)
    throw new Error("Set LANCER_RECORDING_PROFILE to the existing bound conversation profile");
  const app = await launchDesktopByExecutable(
    "/Applications/Lancer.app/Contents/MacOS/Lancer",
    profile,
    {
      realAuthSourceDir: join(homedir(), ".pi", "agent"),
      scrubProviderEnv: true,
      envOverrides: { PI_APP_TEST_MODE: undefined },
    },
  );
  const page = await app.firstWindow();
  await app.focusWindow();
  const stop = test.info().outputPath("recording.stop");
  const recorder = spawn(resolve(".artifacts/full-chain-recording/window-recorder"), [
    String(app.electronApp.process().pid),
    test.info().outputPath("豆包成片回传验收.mp4"),
    stop,
  ]);
  const done = once(recorder, "exit");
  let capture = "";
  recorder.stdout.on("data", (c) => {
    capture += String(c);
  });
  recorder.stderr.on("data", (c) => {
    capture += String(c);
  });
  try {
    await expect.poll(() => capture, { timeout: 20_000 }).toContain("RECORDING_STARTED");
    await expect(page.getByTestId("doubao-app-transcript")).toContainText("开始制作成片", {
      timeout: 30_000,
    });
    async function binding() {
      const saved = JSON.parse(await readFile(join(profile, "doubao-app.json"), "utf8")) as {
        bindings: Record<
          string,
          {
            busy: boolean;
            videos: { name: string; path: string; sha256: string }[];
            binding: { conversationId: string };
          }
        >;
      };
      return Object.values(saved.bindings);
    }
    await expect
      .poll(async () => (await binding()).some((b) => !b.busy && b.videos.length >= 2), {
        timeout: 60_000,
      })
      .toBe(true);
    const state = await binding();
    for (const video of state.flatMap((b) => b.videos)) {
      const card = page.locator(".doubao-app-artifact").filter({ hasText: video.name });
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
    }
    const remake = page.locator(".doubao-app-artifact").filter({ hasText: "Fate蒙版卡点成片.mp4" });
    const root = state.flatMap((b) => b.videos)[0]!.path.split("/.lancer/")[0]!;
    const gates = join(root, "_gates");
    const active = async () =>
      (JSON.parse(await readFile(join(gates, "active.json"), "utf8")) as { video_id: string })
        .video_id;
    const before = await active();
    await remake.getByRole("button", { name: "学片并交接" }).click();
    await expect.poll(active).not.toBe(before);
    const videoId = await active();
    await expect
      .poll(
        async () => {
          try {
            return (
              JSON.parse(await readFile(join(gates, `progress.${videoId}.json`), "utf8")) as {
                finished?: boolean;
              }
            ).finished;
          } catch {
            return false;
          }
        },
        { timeout: 180_000 },
      )
      .toBe(true);
    const handoff = JSON.parse(await readFile(join(gates, `handoff.${videoId}.json`), "utf8")) as {
      status_code: string;
    };
    expect(handoff.status_code).toBe("handoff.ok");
    const media = JSON.parse(await readFile(join(gates, `media.${videoId}.json`), "utf8")) as {
      status_code: string;
    };
    expect(media.status_code).toBe("media.ok");
    await writeFile(
      test.info().outputPath("learning-result.json"),
      await readFile(join(gates, `analysis.${videoId}.json`)),
    );
    await page.getByText("会话连接", { exact: true }).click();
    await page.getByText("学习记录与文字结论", { exact: true }).click();
    await expect(page.getByText("已完成 · 媒体已验证", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await page.screenshot({ path: test.info().outputPath("豆包交付已回到Lancer.png") });
    await writeFile(
      test.info().outputPath("received-proof.json"),
      JSON.stringify(
        state.map((b) => ({
          conversationId: b.binding.conversationId,
          busy: b.busy,
          videos: b.videos,
        })),
        null,
        2,
      ),
    );
  } finally {
    await writeFile(stop, "stop");
    const exit = await done;
    await writeFile(test.info().outputPath("capture.log"), capture);
    await app.close();
    expect(exit).toEqual([0, null]);
  }
});
