import { expect, test } from "@playwright/test";
import { validateMotion, animationDirectory } from "../../electron/video-learn/animation";
const scene = () => ({
  title: "Geometry",
  background: "#ffffff",
  shapes: [
    {
      kind: "circle",
      color: "#ff0000",
      width: 100,
      height: 100,
      keys: [
        { t: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        { t: 5, x: 500, y: 300, scale: 1, rotation: 180, opacity: 1 },
      ],
    },
  ],
});
test("animation accepts bounded deterministic motion and rejects malformed timelines", () => {
  expect(validateMotion(scene()).shapes).toHaveLength(1);
  for (const bad of [NaN, Infinity, -1, 6]) {
    const value = scene();
    value.shapes[0]!.keys[1]!.t = bad;
    expect(() => validateMotion(value)).toThrow("E_ANIMATION_SCHEMA");
  }
  const value = scene();
  value.shapes[0]!.keys.reverse();
  expect(() => validateMotion(value)).toThrow();
});
test("animation rejects executable assets, oversized scenes and directory traversal", () => {
  expect(() => validateMotion({ ...scene(), background: "url(https://example.com)" })).toThrow();
  expect(() =>
    validateMotion({ ...scene(), shapes: [{ ...scene().shapes[0], kind: "script" }] }),
  ).toThrow();
  expect(() =>
    validateMotion({ ...scene(), shapes: Array.from({ length: 1000 }, () => scene().shapes[0]) }),
  ).toThrow();
  expect(() => animationDirectory("/tmp/project", "../../secret")).toThrow();
});
