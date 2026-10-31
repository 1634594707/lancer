import { expect, type Page } from "@playwright/test";

interface FlightFrame {
  readonly at: number;
  readonly id: string;
  readonly source: string;
  readonly head: number;
  readonly endpointError: number;
  readonly landingError: number | null;
}
interface LandingFrame {
  readonly id: string;
  readonly radius: number;
  readonly error: number;
}
interface Capture {
  flights: FlightFrame[];
  landings: LandingFrame[];
  frame: number;
  frameIntervals: number[];
  pathReplacements: number;
}
declare global {
  interface Window {
    liveFlightCapture?: Capture;
  }
}

/** Samples actual painted SVG, independently comparing it with semantic DOM anchors. */
export async function startLiveFlightCapture(page: Page) {
  await page.evaluate(() => {
    if (window.liveFlightCapture) cancelAnimationFrame(window.liveFlightCapture.frame);
    const capture: Capture = {
      flights: [],
      landings: [],
      frame: 0,
      frameIntervals: [],
      pathReplacements: 0,
    };
    let previousFrame = performance.now();
    let paths = new Map<string, SVGPathElement>();
    window.liveFlightCapture = capture;
    const center = (key: string) => {
      const element = [...document.querySelectorAll(`[data-anchor-key="${CSS.escape(key)}"]`)].find(
        (element) =>
          element.getClientRects().length && getComputedStyle(element).visibility === "visible",
      );
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const tick = () => {
      const now = performance.now();
      if (document.querySelector('[data-curve-kind="flight"]'))
        capture.frameIntervals.push(now - previousFrame);
      previousFrame = now;
      const nextPaths = new Map<string, SVGPathElement>();
      for (const path of document.querySelectorAll<SVGPathElement>('[data-curve-kind="flight"]')) {
        const key = path.dataset.curveId!;
        if (paths.has(key) && paths.get(key) !== path) capture.pathReplacements++;
        nextPaths.set(key, path);
        const source = path.dataset.sourceKey!;
        const from = center(source),
          to = center(path.dataset.targetKey!);
        const matrix = path.getScreenCTM();
        const head = path.parentElement?.querySelector<SVGCircleElement>("[data-flight-head]");
        if (!from || !to || !matrix || !head) continue;
        capture.flights.push({
          at: performance.now(),
          id: path.dataset.curveEvent!,
          source,
          head: Number(path.dataset.headProgress),
          endpointError: Math.max(
            distance(path.getPointAtLength(0).matrixTransform(matrix), from),
            distance(path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix), to),
          ),
          landingError:
            Number(path.dataset.headProgress) >= 0.999
              ? distance(
                  new DOMPoint(head.cx.baseVal.value, head.cy.baseVal.value).matrixTransform(
                    matrix,
                  ),
                  to,
                )
              : null,
        });
      }
      paths = nextPaths;
      for (const ring of document.querySelectorAll<SVGCircleElement>("[data-flight-landing]")) {
        const id = ring.dataset.flightLanding!;
        const to = center(`tree:${id}`),
          matrix = ring.getScreenCTM();
        if (to && matrix)
          capture.landings.push({
            id,
            radius: ring.r.baseVal.value,
            error: distance(
              new DOMPoint(ring.cx.baseVal.value, ring.cy.baseVal.value).matrixTransform(matrix),
              to,
            ),
          });
      }
      capture.frame = requestAnimationFrame(tick);
    };
    tick();
  });
}

export async function finishLiveFlightCapture(page: Page, sourcePrefix = "chat:") {
  const capture = await page.evaluate(() => {
    const capture = window.liveFlightCapture!;
    cancelAnimationFrame(capture.frame);
    return capture;
  });
  expect(capture.flights.some((frame) => frame.head > 0.05 && frame.head < 0.98)).toBe(true);
  expect(capture.flights.some((frame) => frame.source.startsWith(sourcePrefix))).toBe(true);
  expect(capture.flights.some((frame) => frame.landingError !== null)).toBe(true);
  expect(Math.max(...capture.flights.map((frame) => frame.endpointError))).toBeLessThan(1);
  expect(Math.max(...capture.flights.map((frame) => frame.landingError ?? 0))).toBeLessThan(1);
  expect(capture.pathReplacements).toBe(0);
  expect(capture.landings.some((frame) => frame.radius > 6)).toBe(true);
  expect(Math.max(...capture.landings.map((frame) => frame.error))).toBeLessThan(1);
  return capture;
}
