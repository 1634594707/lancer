import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
} from "../helpers/electron-app";
import { readRelayEvidence } from "../../electron/video-learn/relay-evidence";
import { buildRelayTree } from "../../src/features/conversation/lancer-process/relay-tree";
import { visibleProcessMessages } from "../../src/features/conversation/lancer-process/visible-process-messages";

/** Real provider artifacts copied with timestamps intact. Session IPC is presentation setup only;
 * no provider request, injected transcript, broad new bridge or main-workspace mutation. */
test("real disk git relay: grouped attempts, branches, hidden labels, flight and reconstruction", async () => {
  test.setTimeout(120_000);
  const source = process.env.LANCER_RELAY_DISK_ROOT;
  test.skip(!source, "Opt in with retained real-run evidence");
  const id = "dy_e3b0c44298fc_a40fc32e";
  const delayed = "analysis.dy_e3b0c44298fc_07eedea8.json";
  const root = await makeWorkspace("relay-tree-real-disk");
  for (const dir of ["raw", "learning", "remake"])
    cpSync(join(source!, dir), join(root, dir), { recursive: true, preserveTimestamps: true });
  mkdirSync(join(root, "_gates"), { recursive: true });
  for (const file of readdirSync(join(source!, "_gates")))
    if (file.endsWith(".json") && file !== delayed && file !== "active.json")
      cpSync(join(source!, "_gates", file), join(root, "_gates", file), {
        preserveTimestamps: true,
      });
  writeFileSync(join(root, "_gates/active.json"), JSON.stringify({ video_id: id }));
  const project = async () =>
    buildRelayTree({
      ...(await readRelayEvidence(root, id)),
      snapshot: { videoId: id, stages: [] },
    });
  const baseline = await project();
  const products = baseline.events.filter((event) => event.artifacts);
  const unverified = products.filter((event) => event.unverified);
  const handoffs = baseline.events.filter((event) => event.kind === "handoff");
  expect(handoffs).toHaveLength(4);
  expect(
    handoffs.every((event) => baseline.events.some((source) => source.id === event.reference)),
  ).toBe(true);
  const profile = await makeUserDataDir();
  const agentDir = join(profile, "agent");
  await seedAgentDir(agentDir, { withOpenAiAuth: false, withDefaultModel: false });
  const harness = await launchDesktop(profile, {
    agentDir,
    initialWorkspaces: [root],
    scrubProviderEnv: true,
  });
  const output = resolve(".lancer-task/out/relay-tree/round3");
  const required = resolve(".lancer-task/out/relay-tree");
  mkdirSync(output, { recursive: true });
  try {
    const page = await harness.firstWindow();
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1800, 1200),
    );
    await page.evaluate(async () => {
      const app = window.piApp!;
      const state = await app.getState();
      await app.createSession({
        workspaceId: state.workspaces[0]!.id,
        title: "lancer-zone:video|单任务接力",
      });
    });
    await expect(page.locator('.lhc[data-l="relay:remake"] .n')).toHaveText("复刻 · Terra+Sol");
    await expect(page.locator('.lhc[data-l="relay:remake"]')).toHaveAttribute(
      "title",
      "复刻 · gpt-6.1-terra + gpt-6.1-sol",
    );
    await expect(page.locator(".lhc")).toHaveCount(5);
    await expect(page.locator(".rp2 .rh")).toContainText("接力树");
    await expect(page.locator(".rp2 .lgd")).toBeHidden();
    await expect(page.getByTestId("lancer-process-surface")).toHaveAttribute(
      "data-provenance",
      "native-session",
    );
    const nodes = page.locator("[data-event-lane]");
    await expect(nodes).toHaveCount(baseline.events.length);
    const visibleHistory = (data: typeof baseline) =>
      visibleProcessMessages(data, {
        time: data.timelineEnd!,
        lane: "all",
        focus: "",
        highlighted: null,
        open: new Set(),
      });
    await expect(page.locator(".process-stage")).toHaveCount(visibleHistory(baseline).length);
    const historical = baseline.conversationEvents!.find(
      (event) => event.artifacts && !baseline.events.some((node) => node.id === event.id),
    )!;
    expect(historical).toBeDefined();
    const historicalRow = page.locator(`[data-process-id="${historical.id}"]`);
    await expect(historicalRow).toBeVisible();
    await historicalRow.locator(".process-stage__head").click();
    await historicalRow.locator(".srw").first().click();
    await expect(historicalRow.locator(".sdt")).toContainText(historical.artifacts![0]!.sha256);
    await historicalRow.locator(".srw").first().click();
    await historicalRow.locator(".process-stage__head").click();
    await expect(page.locator(".process-tree-space .nl")).toHaveCount(0);
    await expect(page.locator("[data-flight-head]")).toHaveCount(0);
    await expect(page.locator('[data-curve-kind="reference"]')).toHaveCount(5); // Four handoffs and one grouped same-lane reuse.
    await expect(page.locator("[data-branch-rail]")).toHaveCount(
      baseline.events.filter((event) => event.kind === "fork").length,
    );
    await expect(page.locator('[data-tree-anchor][data-unverified="true"]')).toHaveCount(
      unverified.length,
    );
    for (const event of unverified) {
      const node = page.locator(`[data-event-id="${event.id}"]`);
      await expect(node).toHaveAttribute("data-event-type", "artifact");
      const x = await node.evaluate((el) => (el as HTMLElement).offsetLeft);
      const forkX = await page
        .locator(`[data-event-id="${event.id}:fork"]`)
        .evaluate((el) => (el as HTMLElement).offsetLeft);
      expect(x).toBeGreaterThan(forkX);
    }
    const positions = () =>
      nodes.evaluateAll((els) =>
        els.map((el) => ({
          id: el.getAttribute("data-event-id"),
          y: (el as HTMLElement).offsetTop,
        })),
      );
    const folded = await positions();
    await page.getByRole("button", { name: "展开详情", exact: true }).click();
    await expect(page.locator(".process-stage__body").first()).toBeVisible();
    await expect(page.getByTestId("transcript")).toContainText("source.mp4");
    await expect(page.getByTestId("transcript")).toContainText("meta.json");
    await expect(page.getByTestId("transcript")).not.toContainText("等待你选择标题");
    await expect(page.getByTestId("transcript")).not.toContainText("一周通勤穿搭");
    await page.screenshot({ path: join(output, "before-collapse.png") });
    expect(await positions()).toEqual(folded);
    await page.getByRole("button", { name: "全部折叠", exact: true }).click();
    await expect(page.locator(".process-stage__body")).toHaveCount(0);
    expect(await positions()).toEqual(folded);
    await page.screenshot({ path: join(output, "after-collapse.png") });
    await page.getByTestId("timeline-pane").hover();
    await page.mouse.wheel(0, -10000);
    // A newly discovered historical failure updates the collapsed retry evidence.
    cpSync(join(source!, "_gates", delayed), join(root, "_gates", delayed), {
      preserveTimestamps: true,
    });
    await expect
      .poll(() => page.locator("[data-flight-head]").count(), { intervals: [10], timeout: 10000 })
      .toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          page.locator('[data-curve-kind="flight"]').evaluateAll((paths) =>
            paths.some((path) => {
              const p = Number(path.getAttribute("data-head-progress"));
              return p > 0.3 && p < 0.98;
            }),
          ),
        { intervals: [10] },
      )
      .toBe(true);
    const flight = await page.locator('[data-curve-kind="flight"]').evaluateAll((paths) =>
      paths.map((path) => ({
        d: path.getAttribute("d"),
        dash: path.getAttribute("stroke-dasharray"),
        head: path.getAttribute("data-head-progress"),
      })),
    );
    writeFileSync(join(output, "live-flight-sample.json"), JSON.stringify(flight, null, 2));
    await page.screenshot({ path: join(output, "live-flight-midpoint.png") });
    await expect(page.locator("[data-flight-head]")).toHaveCount(0);
    const failed = page.locator(
      '[data-event-lane="relay:analysis"][data-event-type="test"][aria-label*="次重试"]',
    );
    await expect(failed).toBeVisible();
    await expect(failed.locator(".gt.x")).toBeVisible();
    await page.screenshot({ path: join(output, "real-failure-red.png") });
    const final = await project();
    await expect(nodes).toHaveCount(final.events.length);
    await expect(page.locator(".process-stage")).toHaveCount(visibleHistory(final).length);
    const branchLengths = await page
      .locator("[data-branch-rail]")
      .evaluateAll((paths) => paths.map((path) => (path as SVGPathElement).getTotalLength()));
    expect(branchLengths.filter((length) => length > 0).length).toBeGreaterThan(0);
    expect(branchLengths.length).toBeLessThanOrEqual(4);
    await page.locator(".rh").hover();
    await page.locator(".rp2").screenshot({ path: join(required, "branches-overview-window.png") });
    // The whole tree must fit without the old scroll-and-stitch capture, which
    // could move the viewport underneath the next pointer interaction.
    const treeViewport = page.getByTestId("process-tree");
    const dimensions = await treeViewport.evaluate((element) => ({
      height: element.clientHeight,
      total: element.scrollHeight,
    }));
    expect(dimensions.total).toBeLessThanOrEqual(dimensions.height);
    await treeViewport.screenshot({ path: join(required, "branches-overview.png") });
    await failed.hover();
    await expect(page.locator(".process-event-tip")).toContainText("E_MODEL_BAD_REF");
    await page.screenshot({ path: join(required, "branches-hover.png") });
    await failed.focus();
    await expect(page.locator(".process-event-tip")).toContainText("sha256");
    await page.locator(".rh").hover();
    const liveTree = await page.locator(".rp2").screenshot();
    await failed.click();
    const retryStage = page.locator(".process-stage").filter({ hasText: "×4 次重试" });
    await expect(retryStage.locator(".process-stage__body")).toBeVisible();
    await retryStage.locator(".sgp").click();
    await retryStage.locator(".srw").first().click();
    await expect(retryStage.locator(".sdt")).toContainText("sha256:");
    const after = await nodes.count();
    await page.reload();
    await expect(nodes).toHaveCount(after);
    await expect(page.locator("[data-flight-head]")).toHaveCount(0);
    const replayUrl = new URL(page.url());
    replayUrl.searchParams.set("lancer-replay", "r8");
    replayUrl.searchParams.set("replay-five-lanes", "1");
    await page.goto(replayUrl.toString());
    await expect(page.locator(".lhc")).toHaveCount(5);
    await page.evaluate(async () => {
      await window.lancerReplay!.seek(55);
    });
    const replayTree = await page.locator(".rp2").screenshot();
    const combined = await page.evaluate(
      async ({ left, right }) => {
        const load = (src: string) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = src;
          });
        const a = await load(left),
          b = await load(right);
        const canvas = document.createElement("canvas");
        canvas.width = a.width + b.width;
        canvas.height = Math.max(a.height, b.height);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(a, 0, 0);
        ctx.drawImage(b, a.width, 0);
        return canvas.toDataURL("image/png").split(",")[1]!;
      },
      {
        left: `data:image/png;base64,${replayTree.toString("base64")}`,
        right: `data:image/png;base64,${liveTree.toString("base64")}`,
      },
    );
    writeFileSync(join(required, "tree-compare.png"), Buffer.from(combined, "base64"));
    writeFileSync(
      join(output, "electron-proof.json"),
      JSON.stringify(
        {
          source,
          root,
          columns: 5,
          nodes: after,
          products: final.events.filter((event) => event.artifacts).length,
          branches: branchLengths.length,
          unverified: unverified.length,
          refreshedWithoutReplay: true,
          treeUnchangedByWorkspaceFold: true,
          comparison:
            "Left: explicit five-lane replay diagnostic (authored demo has four); right: live disk projection. Shared ProcessTree/eventPoint; no live tree stylesheet.",
        },
        null,
        2,
      ),
    );
  } finally {
    await harness.close();
  }
});
