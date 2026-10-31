import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getDesktopState,
  getRealAuthConfig,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
  writeProjectExtension,
} from "../helpers/electron-app";

declare global {
  interface Window {
    replyTiming?: {
      submitted: number;
      submittedWall: number;
      received?: number;
      visible?: number;
      arrivals: number[];
      paints: number[];
      stop: () => void;
    };
  }
}

test("measures real reply arrival separately from transcript rendering", async () => {
  test.setTimeout(180_000);
  const auth = getRealAuthConfig();
  if (!auth.enabled) throw new Error(auth.skipReason);
  const provider = process.env.PI_GUI_PROVIDER;
  const model = process.env.PI_GUI_MODEL;
  if (!provider || !model) throw new Error("Specify the real provider and model");
  const profile = await makeUserDataDir();
  const workspace = await makeWorkspace("reply-latency");
  const runtimePath = join(workspace, "runtime-timing.json");
  await writeProjectExtension(
    workspace,
    "reply-timing.ts",
    `
import { writeFile } from "node:fs/promises";
export default function(pi) {
  const timing = { requests: [], text: [], thinking: [] };
  pi.on("before_provider_request", () => { timing.requests.push(Date.now()); });
  pi.on("message_update", (event) => {
    if (event.assistantMessageEvent.type === "text_delta") timing.text.push(Date.now());
    if (event.assistantMessageEvent.type === "thinking_delta") timing.thinking.push(Date.now());
  });
  pi.on("agent_end", async () => { await writeFile(${JSON.stringify(runtimePath)}, JSON.stringify(timing)); });
}
`,
  );
  const app = await launchDesktop(profile, {
    initialWorkspaces: [workspace],
    realAuthSourceDir: auth.sourceDir,
    enabledModels: [`${provider}/${model}`],
    scrubProviderEnv: true,
    testMode: "foreground",
  });
  try {
    await app.focusWindow();
    const page = await app.firstWindow();
    await openNewThread(page);
    await page
      .getByLabel("New thread prompt")
      .fill(
        "先输出 LATENCY_READY，再逐行列出 40 条整理笔记的方法，每条 15 字左右，最后输出 LATENCY_DONE。不要调用工具。",
      );
    await page.evaluate(() => {
      const timing = {
        submitted: 0,
        submittedWall: 0,
        received: undefined as number | undefined,
        visible: undefined as number | undefined,
        arrivals: [] as number[],
        paints: [] as number[],
        stop: () => {},
      };
      let receivedText = "",
        paintedText = "";
      const unsubscribe = window.piApp!.onSelectedTranscriptChanged((value) => {
        const text =
          value?.transcript
            .filter((item) => item.kind === "message" && item.role === "assistant")
            .map((item) => ("text" in item ? item.text : ""))
            .join("") ?? "";
        if (text.trim() && text !== receivedText) {
          const now = performance.now();
          timing.received ??= now;
          timing.arrivals.push(now);
          receivedText = text;
        }
      });
      const observer = new MutationObserver(() => {
        const text = [...document.querySelectorAll(".process-assistant .message__content")]
          .map((el) => el.textContent)
          .join("");
        if (text.trim() && text !== paintedText) {
          const now = performance.now();
          timing.visible ??= now;
          timing.paints.push(now);
          paintedText = text;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      timing.stop = () => {
        unsubscribe();
        observer.disconnect();
      };
      window.replyTiming = timing;
    });
    await page.getByRole("button", { name: "Start thread", exact: true }).evaluate((button) => {
      button.addEventListener(
        "click",
        () => {
          window.replyTiming!.submitted = performance.now();
          window.replyTiming!.submittedWall = Date.now();
        },
        { once: true, capture: true },
      );
    });
    await page.getByRole("button", { name: "Start thread", exact: true }).click();
    await expect(page.locator(".process-assistant").last()).toContainText("LATENCY_READY", {
      timeout: 120_000,
    });
    await expect
      .poll(
        async () => {
          const state = await getDesktopState(page);
          return state.workspaces
            .flatMap((w) => w.sessions)
            .find((s) => s.id === state.selectedSessionId)?.status;
        },
        { timeout: 120_000 },
      )
      .toBe("idle");
    const timing = await page.evaluate(() => {
      const t = window.replyTiming!;
      t.stop();
      return {
        submitted: t.submitted,
        submittedWall: t.submittedWall,
        received: t.received,
        visible: t.visible,
        receiveMs: t.received! - t.submitted,
        renderMs: t.visible! - t.received!,
        arrivalGaps: t.arrivals.slice(1).map((at, i) => at - t.arrivals[i]!),
        paintGaps: t.paints.slice(1).map((at, i) => at - t.paints[i]!),
      };
    });
    const runtime: unknown = JSON.parse(await readFile(runtimePath, "utf8"));
    await writeFile(
      test.info().outputPath("reply-timing.json"),
      JSON.stringify({ provider, model, ...timing, runtime }, null, 2),
    );
    expect(timing.submitted).toBeGreaterThan(0);
    expect(timing.received).toBeDefined();
    expect(timing.visible).toBeDefined();
    await expect(page.locator(".process-assistant").last()).toContainText("LATENCY_DONE");
    await page.screenshot({ path: test.info().outputPath("reply-visible.png") });
  } finally {
    await app.close();
  }
});
