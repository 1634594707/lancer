import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { expect, test } from "@playwright/test";
import type { LancerReplayApi } from "../../src/features/conversation/lancer-process/replay-surface";
import { REPLAY_FIXTURE } from "../../src/features/conversation/lancer-process/replay-fixture";
import { auditProcessCurves } from "../../tests/helpers/process-curve-audit";
import {
  writeCurveEvidence,
  writeCurveZoom,
  type CurveFrameRecord,
} from "../../tests/helpers/process-curve-evidence";
import {
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  seedLancerScreenshotUiPrefs,
} from "../../tests/helpers/electron-app";

test("records 3360 individually rendered Electron frames into a 56-second 60fps replay", async () => {
  const output = resolve(process.env.LANCER_REPLAY_OUTPUT ?? ".lancer-task/out");
  const round = process.env.LANCER_ROUND ?? "r9";
  expect(round).toMatch(/^r\d+$/);
  const developmentPids = () =>
    execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" })
      .split("\n")
      .filter((line) => /\/Electron\.app\/Contents\/MacOS\/Electron(?:\s|$)/.test(line))
      .map((line) => Number(line.trim().split(/\s+/, 1)[0]));
  expect(developmentPids(), "Only one owned development Electron may run").toEqual([]);
  await mkdir(output, { recursive: true });
  const profile = await makeUserDataDir();
  await seedLancerScreenshotUiPrefs(profile);
  const harness = await launchDesktop(profile, { testMode: "background", scrubProviderEnv: true });
  const appProcess = harness.electronApp.process();
  const encoder = spawn(
    resolve(".lancer-task/out/lancer-video-encoder"),
    [join(output, `lancer-${round}.mp4`)],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let diagnostic = "";
  encoder.stderr.on("data", (chunk: Buffer) => {
    diagnostic += chunk.toString();
  });
  encoder.stdout.on("data", (chunk: Buffer) => {
    diagnostic += chunk.toString();
  });
  const encoderDone = new Promise<number | null>((resolve, reject) => {
    encoder.once("exit", resolve);
    encoder.once("error", reject);
  });
  const frameHash = createHash("sha256");
  const started = Date.now();
  let captured = 0;
  const curveFrames: CurveFrameRecord[] = [];
  const zooms = new Map<string, string>();
  try {
    const page = await harness.firstWindow();
    expect(developmentPids()).toEqual([appProcess.pid]);
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
    );
    const before = await getDesktopState(page);
    const url = new URL(page.url());
    url.searchParams.set("lancer-replay", "r8");
    await page.goto(url.toString());
    await page.waitForFunction(() => Boolean(window.lancerReplay));
    await page.evaluate(() => document.fonts.ready);
    for (let index = 0; index < 3360; index++) {
      const state = await page.evaluate(async (seconds) => {
        const api: LancerReplayApi | undefined = window.lancerReplay;
        if (!api) throw new Error("Replay API missing");
        return api.seek(seconds);
      }, index / 60);
      const audit = await page.evaluate(auditProcessCurves, {
        events: REPLAY_FIXTURE.events,
        time: state.time,
        emissions: true,
        traceSelection: false,
      });
      curveFrames.push({ ...audit, scenario: "script", seconds: index / 60, index });
      expect(audit.failures, `Recorded frame ${index}`).toEqual([]);
      const image = await page.screenshot({ type: "png", animations: "allow" });
      for (const hit of audit.hits)
        if (!zooms.has(hit.id))
          zooms.set(
            hit.id,
            await writeCurveZoom(join(output, "curve-zoom"), image, hit, index / 60),
          );
      frameHash.update(image);
      const header = Buffer.alloc(4);
      header.writeUInt32BE(image.length);
      if (!encoder.stdin.write(header)) await once(encoder.stdin, "drain");
      if (!encoder.stdin.write(image)) await once(encoder.stdin, "drain");
      captured++;
      if (index % 300 === 0) {
        // Fail a contaminated recording without terminating another task's app.
        expect(developmentPids()).toEqual([appProcess.pid]);
        console.log(`Electron capture + curve audit ${index}/3360`);
      }
    }
    encoder.stdin.end();
    const code = await encoderDone;
    expect(code, diagnostic).toBe(0);
    const after = await getDesktopState(page);
    expect(after.workspaces).toEqual(before.workspaces);
    expect(after.selectedSessionId).toEqual(before.selectedSessionId);
    let interactionProofSha256: string | null = null;
    if (process.env.LANCER_CURVE_INTERACTIONS) {
      // This is our immediately preceding, same-build Core proof artifact, not
      // provider/user input. Keep its original frames and explicit provenance.
      const proof = await readFile(process.env.LANCER_CURVE_INTERACTIONS);
      const interactions = JSON.parse(proof.toString()) as { frames: CurveFrameRecord[] };
      expect(Array.isArray(interactions.frames)).toBe(true);
      const frames = interactions.frames.filter((frame) => frame.scenario !== "script");
      expect(frames.length).toBeGreaterThan(0);
      expect(frames.every((frame) => frame.failures.length === 0)).toBe(true);
      curveFrames.push(...frames);
      for (const frame of frames)
        for (const hit of frame.hits)
          if (!zooms.has(hit.id)) {
            const file = `${hit.id.replace(/[^a-zA-Z0-9_-]/g, "-")}.png`;
            await writeFile(
              join(output, "curve-zoom", file),
              await readFile(
                join(dirname(process.env.LANCER_CURVE_INTERACTIONS), "curve-zoom", file),
              ),
            );
            zooms.set(hit.id, file);
          }
      interactionProofSha256 = createHash("sha256").update(proof).digest("hex");
    }
    const curveSummary = await writeCurveEvidence(output, curveFrames, zooms);
    expect(curveSummary.scriptedFrames).toBe(3360);
    expect(curveSummary.maximumError).toBeLessThanOrEqual(1);
    expect(curveSummary.wrongPairs).toBe(0);
    await writeFile(
      join(output, "recording.json"),
      JSON.stringify(
        {
          round,
          file: `lancer-${round}.mp4`,
          electronPid: appProcess.pid,
          observedConcurrentDevelopmentInstances: 1,
          interactionProofSha256,
          curveSummary,
          width: 1440,
          height: 900,
          fps: 60,
          duration: 56,
          frames: captured,
          capture:
            "3360 actual development Electron PNG screenshots, renderer script sampled at i/60 seconds; offline frame-by-frame capture, no duplicated-frame upsampling or reference-video overlay",
          renderer: "shared native-session React components, read-only demonstration fixture",
          frameStreamSha256: frameHash.digest("hex"),
          captureWallSeconds: (Date.now() - started) / 1000,
          providerRequests: 0,
          catalogUnchanged: true,
          encoder: diagnostic.trim(),
        },
        null,
        2,
      ),
    );
  } finally {
    if (encoder.exitCode === null) encoder.kill("SIGTERM");
    await harness.close();
    await writeFile(
      join(output, "curve-cleanup.json"),
      JSON.stringify(
        {
          pid: appProcess.pid,
          exitCode: appProcess.exitCode,
          scriptedFrames: captured,
          combinedFrames: curveFrames.length,
          interactionProof: process.env.LANCER_CURVE_INTERACTIONS ?? null,
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(output, "recording-cleanup.json"),
      JSON.stringify(
        {
          pid: appProcess.pid,
          exitCode: appProcess.exitCode,
          captured,
          encoderExitCode: encoder.exitCode,
        },
        null,
        2,
      ),
    );
  }
});
