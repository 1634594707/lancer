import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import {
  launchDesktop,
  makeUserDataDir,
  seedLancerScreenshotUiPrefs,
} from "../../tests/helpers/electron-app";

test("captures targeted spacing checkpoints without recording video", async () => {
  const output = resolve(process.env.LANCER_POLISH_OUTPUT ?? ".lancer-task/out/polish");
  await mkdir(output, { recursive: true });
  const profile = await makeUserDataDir();
  await seedLancerScreenshotUiPrefs(profile);
  const harness = await launchDesktop(profile, { scrubProviderEnv: true });
  try {
    const page = await harness.firstWindow();
    await harness.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900),
    );
    const url = new URL(page.url());
    url.searchParams.set("lancer-replay", "r8");
    await page.goto(url.toString());
    await page.waitForFunction(() => Boolean(window.lancerReplay));
    await page.evaluate(() => document.fonts.ready);
    const measurements = [];
    for (const seconds of [0, 0.5, 14, 16.5, 18, 21, 24, 28.5]) {
      await page.evaluate(async (time) => {
        await window.lancerReplay!.seek(time);
      }, seconds);
      await page.screenshot({ path: `${output}/${String(seconds).replace(".", "-")}.png` });
      measurements.push(
        await page.evaluate(
          (time) => ({
            seconds: time,
            elements: [...document.querySelectorAll(".sz,.szh,.ssr,.sgp,.srw,.sdt,.kfs")].map(
              (el) => {
                const r = el.getBoundingClientRect();
                const s = getComputedStyle(el);
                return {
                  selector: el.className,
                  text: el.textContent?.slice(0, 45),
                  x: r.x,
                  y: r.y,
                  height: r.height,
                  lineHeight: s.lineHeight,
                  padding: s.padding,
                };
              },
            ),
          }),
          seconds,
        ),
      );
      if (seconds === 0) {
        await expect(page.locator(".lancer-process--blank")).toHaveCount(0);
        await expect(page.getByTestId("thread-title")).toBeVisible();
      } else {
        const rows = await page
          .locator(".ssr")
          .evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().height));
        expect(rows.every((height) => height === 43)).toBe(true);
      }
      if (seconds === 18) {
        const code = page.locator(".sdt");
        await expect(code).toBeVisible();
        expect((await code.boundingBox())!.height).toBe(86);
        const thumbnails = (await page.locator(".kfs").boundingBox())!;
        expect(Math.abs(thumbnails.y - 603)).toBeLessThanOrEqual(1);
        expect(thumbnails.height).toBe(46);
        const toggle = page.locator('[data-tg="sev22_2"]');
        await toggle.click();
        await expect(code).toHaveCount(0);
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await toggle.click();
        await expect(code).toBeVisible();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
      }
    }
    await writeFile(`${output}/measurements.json`, JSON.stringify(measurements, null, 2));
    await page.goto(`file://${resolve(".lancer-task/refs/prototype.html")}`);
    await page.waitForTimeout(500);
    await writeFile(
      `${output}/prototype-geometry.json`,
      JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll(".sz,.szh,.ssr,.sgp,.srw,.sdt,.kfs")].map((el) => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return {
              selector: el.className,
              text: el.textContent?.slice(0, 45),
              x: r.x,
              y: r.y,
              height: r.height,
              lineHeight: s.lineHeight,
              padding: s.padding,
            };
          }),
        ),
        null,
        2,
      ),
    );
  } finally {
    await harness.close();
  }
});
