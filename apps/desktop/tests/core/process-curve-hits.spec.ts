import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { REPLAY_FIXTURE } from "../../src/features/conversation/lancer-process/replay-fixture";
import { REPLAY_TIMING } from "../../src/features/conversation/lancer-process/replay-timing";
import { auditProcessCurves, type CurveAuditInput } from "../helpers/process-curve-audit";
import {
  writeCurveEvidence,
  writeCurveZoom,
  type CurveFrameRecord,
} from "../helpers/process-curve-evidence";
import {
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  seedLancerScreenshotUiPrefs,
  waitForTimelineLayout,
} from "../helpers/electron-app";

test("semantic SVG routes hit both DOM anchors on every replay and interaction frame", async () => {
  const full = process.env.LANCER_CURVE_ALL_FRAMES === "1";
  test.setTimeout(full ? 900_000 : 180_000);
  const output = resolve(process.env.LANCER_CURVE_OUTPUT ?? test.info().outputPath("curve-proof"));
  await mkdir(output, { recursive: true });
  const profile = await makeUserDataDir();
  await seedLancerScreenshotUiPrefs(profile);
  const harness = await launchDesktop(profile, { testMode: "background", scrubProviderEnv: true });
  const appProcess = harness.electronApp.process();
  const frames: CurveFrameRecord[] = [];
  const zooms = new Map<string, string>();
  try {
    const page = await harness.firstWindow();
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
    );
    const before = await getDesktopState(page);
    const url = new URL(page.url());
    url.searchParams.set("lancer-replay", "r8");
    await page.goto(url.toString());
    await page.waitForFunction(() => Boolean(window.lancerReplay));
    await page.evaluate(() => document.fonts.ready);
    let input: CurveAuditInput = {
      events: REPLAY_FIXTURE.events,
      time: 2,
      emissions: true,
      traceSelection: false,
    };
    let seconds = 0;
    const sample = async (scenario: string, index: number) => {
      const audit = await page.evaluate(auditProcessCurves, input);
      frames.push({ ...audit, scenario, seconds, index });
      expect(audit.failures, `${scenario} frame ${index} @${seconds}s`).toEqual([]);
      const fresh = audit.hits.filter((hit) => !zooms.has(hit.id));
      if (fresh.length) {
        const image = await page.screenshot();
        for (const hit of fresh)
          zooms.set(hit.id, await writeCurveZoom(join(output, "curve-zoom"), image, hit, seconds));
      }
      return audit;
    };
    const globalLayout: unknown[] = [];
    await mkdir(join(output, "global-shots"), { recursive: true });
    const count = full ? 3360 : 112,
      rate = full ? 60 : 2;
    for (let i = 0; i < count; i++) {
      seconds = i / rate;
      const state = await page.evaluate(async (s) => window.lancerReplay!.seek(s), seconds);
      input = { ...input, time: state.time };
      await sample("script", i);
      if ([41, 43.5, 47].includes(seconds))
        await page.screenshot({ path: join(output, "global-shots", `${seconds}.png`) });
      if (seconds >= 41 && seconds <= 49 && Number.isInteger(seconds * 2)) {
        const guide = REPLAY_TIMING[Math.round(seconds * 2)]!.anchor!;
        const actualY = await page
          .locator(guide.selector)
          .evaluate((element) => element.getBoundingClientRect().top);
        expect(
          Math.abs(actualY - guide.y),
          `global reading anchor ${seconds}s`,
        ).toBeLessThanOrEqual(1);
        const rowHeights = await page
          .locator(".eh[data-ev]")
          .evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect().height),
          );
        expect(rowHeights.every((height) => Math.abs(height - 29) < 0.01)).toBe(true);
        globalLayout.push({
          referenceAnchor: guide,
          actualAnchorY: actualY,
          anchorError: Math.abs(actualY - guide.y),
          seconds,
          rows: await page.locator(".eh[data-ev]").evaluateAll((elements) =>
            elements.map((element) => {
              const r = element.getBoundingClientRect(),
                title = element.querySelector(".ti")!.getBoundingClientRect();
              return {
                id: element.getAttribute("data-ev"),
                top: r.top,
                height: r.height,
                titleTop: title.top,
                titleLeft: title.left,
                details:
                  element.getAttribute("data-ev") === "ev37"
                    ? [
                        ...(element.parentElement?.querySelectorAll(".eb, .sgp, .srw, .sdt") ?? []),
                      ].map((child) => ({
                        cls: child.className,
                        h: child.getBoundingClientRect().height,
                        line: getComputedStyle(child).lineHeight,
                      }))
                    : undefined,
              };
            }),
          ),
        });
      }
      if (full && i % 300 === 0) console.log(`Curve audit ${i}/3360`);
    }
    await writeFile(join(output, "global-layout.json"), JSON.stringify(globalLayout, null, 2));
    expect(frames.some((frame) => frame.hits.some((hit) => hit.id.startsWith("flight:")))).toBe(
      true,
    );
    const seek = async (s: number) => {
      seconds = s;
      const state = await page.evaluate(async (value) => window.lancerReplay!.seek(value), s);
      input = { ...input, time: state.time, selectionId: null, traceSelection: false };
    };
    const settled = async () => {
      await waitForTimelineLayout(page);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    };
    await seek(55.5);
    await page.locator('button[data-event-id="ev37"]').click();
    await page.mouse.move(0, 0);
    await settled();
    input = { ...input, selectionId: "ev37", traceSelection: true };
    expect((await sample("selection", 0)).hits.some((hit) => hit.id === "selection:ev37")).toBe(
      true,
    );
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 650),
    );
    await settled();
    expect(
      (await sample("target-clipped", 0)).hits.some((hit) => hit.id === "selection:ev37"),
    ).toBe(false);
    await page.locator('button[data-event-id="ev37"]').scrollIntoViewIfNeeded();
    await page.locator('button[data-event-id="ev37"]').click();
    await page.mouse.move(0, 0);
    await settled();
    expect(
      (await sample("target-restored", 0)).hits.some((hit) => hit.id === "selection:ev37"),
    ).toBe(true);
    for (const target of ["timeline-pane", "process-tree"]) {
      for (let i = 0; i < 60; i++) {
        await page.getByTestId(target).evaluate(async (element, step) => {
          element.scrollTop = Math.max(0, element.scrollTop + (step < 30 ? -3 : 3));
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }, i);
        await sample(`${target}-scroll`, i);
      }
    }
    for (const open of [false, true]) {
      const head = page.locator('button.eh[data-ev="ev37"]');
      if ((await head.getAttribute("aria-expanded")) !== String(open)) await head.click();
      await settled();
      input = { ...input, selectionId: open ? "ev37" : null };
      await sample(open ? "expand" : "collapse", 0);
    }
    for (const width of [1180, 1600, 1440]) {
      await harness.electronApp.evaluate(
        ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]!.setContentSize(w, 900),
        width,
      );
      await settled();
      await sample("resize", width);
    }
    await page.locator('button[data-event-id="ev37"]').hover();
    await settled();
    expect((await sample("hover", 0)).hits.some((hit) => hit.id === "selection:ev37")).toBe(true);
    await page.mouse.move(0, 0);
    for (const s of [18, 23, 35, 41, 47]) {
      await seek(s);
      if (s < 40.8) await page.getByTestId("process-global-flow").click();
      await settled();
      await sample("global-switch-and-recenter", s);
    }
    // A correct target geometry with an incorrect semantic ID must still fail.
    const negatives: unknown[] = [];
    for (const fault of ["offset", "pair", "missing"] as const) {
      await seek(55.5);
      await settled();
      const negative = await page.evaluate(auditProcessCurves, { ...input, fault });
      expect(
        negative.failures.some((f) =>
          f.includes(
            fault === "offset" ? ">1px" : fault === "pair" ? "wrong pairing" : "missing expected",
          ),
        ),
      ).toBe(true);
      negatives.push({ fault, failures: negative.failures });
    }
    await writeFile(join(output, "negative-controls.json"), JSON.stringify(negatives, null, 2));
    const after = await getDesktopState(page);
    expect(after.workspaces).toEqual(before.workspaces);
    expect(after.selectedSessionId).toEqual(before.selectedSessionId);
    const summary = await writeCurveEvidence(output, frames, zooms);
    expect(summary.scriptedFrames).toBe(count);
    expect(summary.maximumError).toBeLessThanOrEqual(1);
    expect(summary.wrongPairs).toBe(0);
    // Assert the semantic routes exercised by this script, rather than an
    // incidental count that changes when clipped anchors leave the viewport.
    expect(summary.curves.map((curve) => curve.id)).toEqual(
      expect.arrayContaining([
        "flight:ev10:chat",
        "flight:ev12:chat",
        "flight:ev22:chat",
        "flight:ev38:reference",
        "reference:ev38",
        "retry:ev28",
        "retry:ev39",
        "retry:ev43",
        "selection:ev37",
      ]),
    );
  } finally {
    await writeCurveEvidence(output, frames, zooms);
    await harness.close();
    await writeFile(
      join(output, "curve-cleanup.json"),
      JSON.stringify(
        { pid: appProcess.pid, exitCode: appProcess.exitCode, frames: frames.length },
        null,
        2,
      ),
    );
  }
});
