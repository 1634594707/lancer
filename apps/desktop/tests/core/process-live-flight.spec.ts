import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  getDesktopState,
  getSelectedTranscript,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  openNewThread,
  writeProjectExtension,
} from "../helpers/electron-app";
import { finishLiveFlightCapture, startLiveFlightCapture } from "../helpers/live-flight-capture";

test("live runtime flies from its real model chip, lands, and never replays history", async () => {
  test.setTimeout(120_000);
  const profile = await makeUserDataDir();
  const agentDir = join(profile, "agent");
  const workspace = await makeWorkspace("live-flight");
  await writeFile(
    join(profile, "ui-state.json"),
    JSON.stringify({ themeMode: "light", language: "en" }),
  );
  await seedAgentDir(agentDir, { withOpenAiAuth: false, withDefaultModel: false });
  await writeFile(
    join(agentDir, "settings.json"),
    JSON.stringify({
      defaultProvider: "flight-fixture",
      defaultModel: "deepseek-v4-pro",
      enabledModels: ["flight-fixture/deepseek-v4-pro"],
      compaction: { enabled: false },
    }),
  );
  // Real Pi runtime with a deterministic local provider. No injected session events.
  await writeProjectExtension(
    workspace,
    "flight-fixture.ts",
    `
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
export default function(pi) {
  pi.registerProvider("flight-fixture", {
    baseUrl: "http://127.0.0.1:9/never-contact", apiKey: "LOCAL_FIXTURE", api: "flight-fixture",
    models: [{ id: "deepseek-v4-pro", name: "DeepSeek flight fixture", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    streamSimple(model) {
      const text = "LIVE_FLIGHT_READY";
      const message = { role: "assistant", content: [{ type: "text", text }], api: model.api, provider: model.provider, model: model.id, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() };
      const stream = createAssistantMessageEventStream();
      stream.push({ type: "start", partial: { ...message, content: [] } });
      stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message });
      stream.push({ type: "done", reason: "stop", message });
      return stream;
    },
  });
}
`,
  );
  const harness = await launchDesktop(profile, {
    agentDir,
    initialWorkspaces: [workspace],
    scrubProviderEnv: true,
    testMode: "background",
    recordVideoDir:
      process.env.LANCER_RECORD_FLIGHTS === "1" ? test.info().outputPath("video") : undefined,
    recordVideoSize: { width: 1480, height: 980 },
  });
  try {
    await harness.focusWindow();
    const page = await harness.firstWindow();
    await openNewThread(page);
    await page.getByLabel("New thread prompt").fill("Initial live flight");
    await page.getByRole("button", { name: "Start thread", exact: true }).click();
    await expect(page.getByTestId("composer")).toBeVisible();
    await expect(page.locator(".process-assistant").last()).toContainText("LIVE_FLIGHT_READY");
    await expect
      .poll(async () => {
        const state = await getDesktopState(page);
        return state.workspaces
          .flatMap((w) => w.sessions)
          .find((s) => s.id === state.selectedSessionId)?.status;
      })
      .toBe("idle");
    await expect(page.locator("[data-flight-head], [data-flight-landing]")).toHaveCount(0);
    await expect(page.getByTestId("lancer-process-surface")).toHaveAttribute(
      "data-provenance",
      "native-session",
    );
    await startLiveFlightCapture(page);
    await page.getByTestId("composer").fill("Another live flight");
    await page.getByTestId("send").click();
    await expect(page.locator('[data-flight-source="family:deepseek"]')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("model-and-chat-flight.png") });
    await expect
      .poll(() => page.locator("[data-flight-landing]").count(), { intervals: [10] })
      .toBeGreaterThan(0);
    await page.screenshot({ path: test.info().outputPath("live-landing.png") });
    await expect(page.locator("[data-flight-head], [data-flight-landing]")).toHaveCount(0);
    const capture = await finishLiveFlightCapture(page);
    expect(capture.flights.some((frame) => frame.source === "family:deepseek")).toBe(true);
    await writeFile(test.info().outputPath("live-flight.json"), JSON.stringify(capture, null, 2));
    await page.reload();
    await expect(page.locator(".process-assistant")).toHaveCount(2);
    await startLiveFlightCapture(page);
    // Observe more than the entire flight + landing lifetime after rehydration.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const end = performance.now() + 1900;
          const tick = () => (performance.now() >= end ? resolve() : requestAnimationFrame(tick));
          requestAnimationFrame(tick);
        }),
    );
    expect(
      await page.evaluate(() => ({
        flights: window.liveFlightCapture!.flights.length,
        landings: window.liveFlightCapture!.landings.length,
      })),
    ).toEqual({ flights: 0, landings: 0 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByTestId("composer").fill("Reduced motion");
    await page.getByTestId("send").click();
    await expect(page.locator(".process-assistant")).toHaveCount(3);
    await expect(page.locator("[data-flight-head], [data-flight-landing]")).toHaveCount(0);
    expect(await page.evaluate(() => window.liveFlightCapture!.flights.length)).toBe(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // Create enough genuine turns to overflow both independently scrollable panes.
    for (let i = 0; i < 12; i++) {
      await page.getByTestId("composer").fill(`History turn ${i}`);
      await page.getByTestId("send").click();
      // Virtualization only mounts visible bubbles; completion belongs to the
      // durable transcript, not the number of DOM rows at this scroll position.
      await expect
        .poll(
          async () =>
            (await getSelectedTranscript(page))?.transcript.filter(
              (entry) => entry.kind === "message" && entry.role === "assistant",
            ).length,
        )
        .toBe(4 + i);
      await expect
        .poll(async () => {
          const state = await getDesktopState(page);
          return state.workspaces
            .flatMap((w) => w.sessions)
            .find((s) => s.id === state.selectedSessionId)?.status;
        })
        .toBe("idle");
    }
    await expect(page.locator("[data-flight-head], [data-flight-landing]")).toHaveCount(0);
    const tree = page.getByTestId("process-tree");
    await expect
      .poll(() => tree.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeGreaterThan(200);
    await tree.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    await page.getByTestId("timeline-pane").evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => tree.evaluate((el) => el.scrollTop)).toBe(0);
    await startLiveFlightCapture(page);
    await page.getByTestId("composer").fill("Follow from history");
    await page.getByTestId("send").click();
    await expect
      .poll(() => page.locator("[data-flight-landing]").count(), { intervals: [10] })
      .toBeGreaterThan(0);
    await expect.poll(() => tree.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const landingGap = await tree.evaluate((el) => {
      const node = el.querySelector<HTMLElement>("[data-tree-anchor]:last-of-type")!;
      return el.getBoundingClientRect().bottom - node.getBoundingClientRect().bottom;
    });
    expect(landingGap).toBeGreaterThan(70);
    await page.screenshot({ path: test.info().outputPath("follow-from-history.png") });
    await expect(page.locator("[data-flight-head], [data-flight-landing]")).toHaveCount(0);
    await writeFile(
      test.info().outputPath("follow-raw.json"),
      JSON.stringify(await page.evaluate(() => window.liveFlightCapture), null, 2),
    );
    // Offscreen chat uses the visible model chip as the emission source.
    const followed = await finishLiveFlightCapture(page, "family:deepseek");
    await writeFile(
      test.info().outputPath("follow-from-history.json"),
      JSON.stringify(followed, null, 2),
    );
  } finally {
    await harness.close();
  }
});
