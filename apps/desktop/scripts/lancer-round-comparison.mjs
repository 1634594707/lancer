import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(process.argv[2] ?? ".lancer-task/out");
const load = async (path) => JSON.parse(await readFile(path, "utf8"));
const current = await load(join(root, "compare/scores.json"));
const baseline = await load(join(root, "compare-r8-common/scores.json"));
const legacyCurrent = await load(join(root, "compare-r9-legacy/scores.json"));
const published = await load(resolve(root, "../out-r8/compare/scores.json"));
for (const score of [current, baseline, legacyCurrent, published]) {
  if (score.frames.length !== 112) throw new Error("Exactly 112 frames are required");
}
const rounded = (n) => Number(n.toFixed(5));
const frames = current.frames.map((frame, i) => {
  const old = baseline.frames[i],
    legacy = legacyCurrent.frames[i],
    original = published.frames[i];
  if ([old, legacy, original].some((f) => f.index !== i || f.seconds !== frame.seconds))
    throw new Error(`Frame mismatch ${i}`);
  return {
    index: i,
    seconds: frame.seconds,
    r8CommonMae: old.maePercent,
    r9CommonMae: frame.maePercent,
    deltaPercentagePoints: rounded(frame.maePercent - old.maePercent),
    r8PublishedMae: original.maePercent,
    r9LegacyReferenceMae: legacy.maePercent,
    legacyDeltaPercentagePoints: rounded(legacy.maePercent - original.maePercent),
    changedPixelsPercent: frame.changedPixelsPercent,
    regions: Object.fromEntries(
      Object.keys(frame.regions).map((key) => [
        key,
        {
          r8: old.regions[key],
          r9: frame.regions[key],
          delta: rounded(frame.regions[key] - old.regions[key]),
        },
      ]),
    ),
  };
});
const definitions = [
  ["all", 0, 55.5],
  ["excluding-first-frame", 0.5, 55.5],
  ["first-frame", 0, 0],
  ["download-and-handoff", 0.5, 13.5],
  ["expanded-chat", 14, 28.5],
  ["research", 29, 40.5],
  ["global-flow", 41, 49],
  ["global-ending", 49.5, 55.5],
];
const mean = (rows, get) => rounded(rows.reduce((sum, row) => sum + get(row), 0) / rows.length);
const segments = definitions.map(([name, from, to]) => {
  const rows = frames.filter((frame) => frame.seconds >= from && frame.seconds <= to);
  return {
    name,
    from,
    to,
    count: rows.length,
    r8CommonMae: mean(rows, (f) => f.r8CommonMae),
    r9CommonMae: mean(rows, (f) => f.r9CommonMae),
    deltaPercentagePoints: mean(rows, (f) => f.deltaPercentagePoints),
    r8PublishedMae: mean(rows, (f) => f.r8PublishedMae),
    r9LegacyReferenceMae: mean(rows, (f) => f.r9LegacyReferenceMae),
    improved: rows.filter((f) => f.deltaPercentagePoints < -0.00001).length,
    regressed: rows.filter((f) => f.deltaPercentagePoints > 0.00001).length,
    regions: Object.fromEntries(
      Object.keys(rows[0].regions).map((key) => [
        key,
        {
          r8: mean(rows, (f) => f.regions[key].r8),
          r9: mean(rows, (f) => f.regions[key].r9),
          delta: mean(rows, (f) => f.regions[key].delta),
        },
      ]),
    ),
  };
});
const result = {
  method:
    "Primary: freshly decoded source video, freshly decoded R8 and R9 videos, identical RGB MAE algorithm and sRGB normalization. Secondary: R8 published score and R9 against the original cached R8 reference frames. Delta = R9 minus R8, negative is improvement; not a perceptual similarity score.",
  currentSummary: current.summary,
  commonBaselineSummary: baseline.summary,
  publishedBaselineSummary: published.summary,
  legacyCurrentSummary: legacyCurrent.summary,
  segments,
  worstRegressions: frames
    .filter((f) => f.deltaPercentagePoints > 0.00001)
    .sort((a, b) => b.deltaPercentagePoints - a.deltaPercentagePoints)
    .slice(0, 10),
  regionalRegressions: Object.fromEntries(
    Object.keys(frames[0].regions).map((key) => {
      const worse = frames
        .filter((f) => f.regions[key].delta > 0.00001)
        .sort((a, b) => b.regions[key].delta - a.regions[key].delta);
      return [
        key,
        {
          count: worse.length,
          worst: worse.slice(0, 3).map((f) => ({ seconds: f.seconds, ...f.regions[key] })),
        },
      ];
    }),
  ),
  bestImprovements: [...frames]
    .sort((a, b) => a.deltaPercentagePoints - b.deltaPercentagePoints)
    .slice(0, 10),
  frames,
};
await writeFile(join(root, "round-comparison.json"), JSON.stringify(result, null, 2));
await writeFile(
  join(root, "round-comparison.csv"),
  [
    "frame,seconds,r8_common_mae,r9_common_mae,delta_pp,r8_published_mae,r9_legacy_reference_mae,legacy_delta_pp",
    ...frames.map((f) =>
      [
        f.index,
        f.seconds,
        f.r8CommonMae,
        f.r9CommonMae,
        f.deltaPercentagePoints,
        f.r8PublishedMae,
        f.r9LegacyReferenceMae,
        f.legacyDeltaPercentagePoints,
      ].join(","),
    ),
  ].join("\n") + "\n",
);
await writeFile(
  join(root, "round-comparison.md"),
  [
    "## 分段对照",
    "",
    "同一新解码参考；Δ = R9 − R8（百分点），负数为提升。",
    "",
    "| 时段 | 帧数 | R8 MAE % | R9 MAE % | Δ pp | 提升/退步帧 |",
    "|---|---:|---:|---:|---:|---:|",
    ...segments.map(
      (s) =>
        `| ${s.name} (${s.from}–${s.to}s) | ${s.count} | ${s.r8CommonMae.toFixed(5)} | ${s.r9CommonMae.toFixed(5)} | ${s.deltaPercentagePoints.toFixed(5)} | ${s.improved}/${s.regressed} |`,
    ),
    "",
    "## 全部 112 帧",
    "",
    "原报告列使用 R8 原始缓存参考，新参考列使用重新解码的视频；不可混为一次纯 CSS 消融实验。",
    "",
    "| 帧/并排图 | 秒 | R8 同参考 % | R9 同参考 % | Δ pp | R8 原报告 % | R9 对旧缓存参考 % |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...frames.map(
      (f) =>
        `| [${String(f.index).padStart(3, "0")}](compare/${String(f.index).padStart(3, "0")}.png) | ${f.seconds.toFixed(1)} | ${f.r8CommonMae.toFixed(5)} | ${f.r9CommonMae.toFixed(5)} | ${f.deltaPercentagePoints.toFixed(5)} | ${f.r8PublishedMae.toFixed(5)} | ${f.r9LegacyReferenceMae.toFixed(5)} |`,
    ),
  ].join("\n") + "\n",
);
console.log(
  JSON.stringify({ segments, worstRegressions: result.worstRegressions.slice(0, 5) }, null, 2),
);
