import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";

// Compare decoded MP4 frames, not the pre-encoding screenshots. Scores use every RGB
// pixel at native resolution, with no registration, blur, cropping or tolerance mask.
const root = resolve(process.argv[2] ?? ".lancer-task/out");
const round = process.env.LANCER_ROUND ?? "r9";
const output = resolve(process.env.LANCER_COMPARE_OUTPUT ?? join(root, "compare"));
const referenceFrames = resolve(
  process.env.LANCER_REFERENCE_FRAMES ??
    join(root, round === "r8" ? "ref-frames" : "ref-frames-video"),
);
const actualFrames = resolve(process.env.LANCER_ACTUAL_FRAMES ?? join(root, "lancer-frames"));
const video = resolve(process.env.LANCER_VIDEO ?? join(root, `lancer-${round}.mp4`));
const renderImages = process.env.LANCER_COMPARE_IMAGES !== "0";
const captureKind =
  process.env.LANCER_COMPARE_CAPTURE_KIND === "png" ? "electron-png" : "decoded-mp4";
await mkdir(output, { recursive: true });
const captureLabel = captureKind === "electron-png" ? "ELECTRON PNG" : "ELECTRON MP4";
const regions = {
  titlebar: [0, 0, 1440, 44],
  sidebar: [0, 44, 232, 823],
  relay: [232, 44, 756, 139],
  conversation: [232, 183, 756, 592],
  tree: [988, 44, 452, 706],
  composer: [232, 775, 756, 92],
  legend: [988, 750, 452, 117],
  footer: [0, 867, 1440, 33],
};
const frames = [];
const rounded = (value) => Number(value.toFixed(5));
for (let index = 0; index < 112; index++) {
  const name = `${String(index).padStart(3, "0")}.png`;
  const reference = join(referenceFrames, name);
  const actual = join(actualFrames, name);
  const [a, b] = await Promise.all(
    [reference, actual].map((path) =>
      sharp(path)
        .flatten({ background: "white" })
        .toColourspace("srgb")
        .removeAlpha()
        .raw()
        .toBuffer(),
    ),
  );
  if (a.length !== 1440 * 900 * 3 || b.length !== a.length)
    throw new Error(`Invalid dimensions: ${name}`);
  let sum = 0,
    squared = 0,
    changed = 0;
  const regionSum = Object.fromEntries(Object.keys(regions).map((key) => [key, 0]));
  for (let y = 0; y < 900; y++) {
    const activeRegions = Object.entries(regions).filter(
      ([, [, ry, , rh]]) => y >= ry && y < ry + rh,
    );
    for (let x = 0; x < 1440; x++) {
      const offset = (y * 1440 + x) * 3;
      let pixel = 0,
        maximum = 0;
      for (let c = 0; c < 3; c++) {
        const delta = Math.abs(a[offset + c] - b[offset + c]);
        pixel += delta;
        maximum = Math.max(maximum, delta);
        squared += delta * delta;
      }
      sum += pixel;
      if (maximum > 16) changed++;
      for (const [key, [rx, , rw]] of activeRegions) {
        if (x >= rx && x < rx + rw) regionSum[key] += pixel;
      }
    }
  }
  const rmse = Math.sqrt(squared / a.length);
  const score = {
    index,
    seconds: index / 2,
    file: name,
    maePercent: rounded((sum / a.length / 255) * 100),
    rmsePercent: rounded((rmse / 255) * 100),
    changedPixelsPercent: rounded((changed / (1440 * 900)) * 100),
    psnrDb: rmse ? rounded(20 * Math.log10(255 / rmse)) : null,
    regions: Object.fromEntries(
      Object.entries(regions).map(([key, [, , width, height]]) => [
        key,
        rounded((regionSum[key] / (width * height * 3 * 255)) * 100),
      ]),
    ),
  };
  frames.push(score);
  if (renderImages) {
    const label = Buffer.from(
      `<svg width="2880" height="28"><rect width="2880" height="28" fill="#111827"/><g fill="white" font-family="Arial" font-size="14"><text x="12" y="19">REFERENCE - ${score.seconds.toFixed(1)}s</text><text x="1452" y="19">${captureLabel} - ${score.seconds.toFixed(1)}s | RGB MAE ${score.maePercent.toFixed(3)}% | changed pixels ${score.changedPixelsPercent.toFixed(2)}%</text></g></svg>`,
    );
    await sharp({ create: { width: 2880, height: 928, channels: 3, background: "white" } })
      .composite([
        { input: label, left: 0, top: 0 },
        { input: reference, left: 0, top: 28 },
        { input: actual, left: 1440, top: 28 },
      ])
      .png()
      .toFile(join(output, name));
  }
}
const sorted = [...frames].sort((a, b) => b.maePercent - a.maePercent);
const summary = {
  round,
  referenceFrames,
  actualFrames,
  count: frames.length,
  metric:
    "RGB MAE percent = 100 * sum(|reference - actual RGB|)/(1440*900*3*255); lower is better; not perceptual similarity or a pixel-perfect claim",
  changedPixelMetric:
    "percent of pixels whose maximum absolute RGB channel difference exceeds 16/255",
  normalization: "sRGB, 1440x900; no geometric registration, blur, masking or resized inputs",
  meanMaePercent: rounded(frames.reduce((sum, f) => sum + f.maePercent, 0) / frames.length),
  medianMaePercent: rounded((sorted[55].maePercent + sorted[56].maePercent) / 2),
  p95MaePercent: sorted[5].maePercent,
  maximum: sorted[0],
  minimum: sorted.at(-1),
  worstTen: sorted.slice(0, 10),
  meanRegionMaePercent: Object.fromEntries(
    Object.keys(regions).map((key) => [
      key,
      rounded(frames.reduce((sum, f) => sum + f.regions[key], 0) / frames.length),
    ]),
  ),
  captureKind,
  videoSha256:
    captureKind === "electron-png"
      ? null
      : createHash("sha256")
          .update(await readFile(video))
          .digest("hex"),
};
await writeFile(join(output, "scores.json"), JSON.stringify({ summary, frames }, null, 2));
await writeFile(
  join(output, "scores.csv"),
  [
    "frame,seconds,mae_percent,rmse_percent,changed_pixels_percent,psnr_db," +
      Object.keys(regions).join(","),
    ...frames.map((f) =>
      [
        f.index,
        f.seconds,
        f.maePercent,
        f.rmsePercent,
        f.changedPixelsPercent,
        f.psnrDb,
        ...Object.keys(regions).map((key) => f.regions[key]),
      ].join(","),
    ),
  ].join("\n") + "\n",
);
await writeFile(
  join(output, "scores.md"),
  [
    "| 帧 | 秒 | RGB MAE % ↓ | 变化像素 % ↓ |",
    "|---:|---:|---:|---:|",
    ...frames.map(
      (f) =>
        `| ${renderImages ? `[${String(f.index).padStart(3, "0")}](${f.file})` : String(f.index).padStart(3, "0")} | ${f.seconds.toFixed(1)} | ${f.maePercent.toFixed(3)} | ${f.changedPixelsPercent.toFixed(2)} |`,
    ),
  ].join("\n") + "\n",
);
if (renderImages)
  await writeFile(
    join(output, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Lancer ${round.toUpperCase()}: 112 frame comparisons</title><style>body{margin:24px;background:#f4f5f7;font:14px system-ui;color:#182030}video{width:720px;max-width:100%}article{margin:20px 0;background:white;padding:10px}img{width:100%}a{color:#3573bd}</style><h1>${round.toUpperCase()} · ${captureLabel} vs reference</h1><p>112 samples · 0.5s interval · 1440×900 each side · lower MAE is better.</p><p>Mean RGB MAE: ${summary.meanMaePercent}% · P95: ${summary.p95MaePercent}% · max: ${summary.maximum.maePercent}% at ${summary.maximum.seconds}s. This is not a perceptual similarity percentage.</p><p><a href="scores.csv">CSV</a> · <a href="scores.json">JSON / regional scores</a> · <a href="../REPORT.md">Report / limitations</a></p>${captureKind === "decoded-mp4" ? `<video controls src="../lancer-${round}.mp4"></video>` : ""}<h2>Chronological comparisons</h2>${frames.map((f) => `<article id="frame-${f.index}"><a href="${f.file}">${f.seconds.toFixed(1)}s · RGB MAE ${f.maePercent.toFixed(3)}% · changed pixels ${f.changedPixelsPercent.toFixed(2)}%</a><br><img loading="lazy" src="${f.file}"></article>`).join("\n")}`,
  );
console.log(JSON.stringify(summary, null, 2));
