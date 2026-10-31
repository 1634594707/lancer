import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CurveAuditFrame, CurveHit } from "./process-curve-audit";

export interface CurveFrameRecord extends CurveAuditFrame {
  readonly scenario: string;
  readonly seconds: number;
  readonly index: number;
}
export function summarizeCurveFrames(frames: readonly CurveFrameRecord[]) {
  const byCurve = new Map<
    string,
    {
      id: string;
      eventId: string;
      source: string;
      target: string;
      samples: number;
      maximumError: number;
      errorSum: number;
      wrongPairs: number;
      landingSamples: number;
      maximumLandingError: number;
    }
  >();
  for (const frame of frames)
    for (const hit of frame.hits) {
      const row = byCurve.get(hit.id) ?? {
        id: hit.id,
        eventId: hit.eventId,
        source: hit.sourceKey,
        target: hit.targetKey,
        samples: 0,
        maximumError: 0,
        errorSum: 0,
        wrongPairs: 0,
        landingSamples: 0,
        maximumLandingError: 0,
      };
      row.samples++;
      row.maximumError = Math.max(row.maximumError, hit.sourceError, hit.targetError);
      row.errorSum += hit.sourceError + hit.targetError;
      row.wrongPairs += Number(!hit.correctPair);
      if (hit.landingError !== null) {
        row.landingSamples++;
        row.maximumLandingError = Math.max(row.maximumLandingError, hit.landingError);
      }
      byCurve.set(hit.id, row);
    }
  const curves = [...byCurve.values()].map(({ errorSum, ...row }) => ({
    ...row,
    averageEndpointError: errorSum / (row.samples * 2),
  }));
  return {
    frames: frames.length,
    scriptedFrames: frames.filter((frame) => frame.scenario === "script").length,
    observedCurves: curves.length,
    routeEndpointSamples: curves.reduce((sum, row) => sum + 2 * row.samples, 0),
    paintedPathSamples: frames.reduce(
      (sum, frame) => sum + frame.hits.reduce((n, hit) => n + hit.paintedPaths, 0),
      0,
    ),
    endpointSamples: frames.reduce(
      (sum, frame) => sum + frame.hits.reduce((n, hit) => n + 2 * hit.paintedPaths, 0),
      0,
    ),
    maximumError: Math.max(0, ...curves.map((row) => row.maximumError)),
    maximumLandingError: Math.max(0, ...curves.map((row) => row.maximumLandingError)),
    wrongPairs: curves.reduce((sum, row) => sum + row.wrongPairs, 0),
    failedFrames: frames.filter((frame) => frame.failures.length).length,
    curves,
  };
}
const xml = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
export async function writeCurveZoom(
  directory: string,
  image: Buffer,
  hit: CurveHit,
  seconds: number,
) {
  await mkdir(directory, { recursive: true });
  const metadata = await sharp(image).metadata();
  const panels = await Promise.all(
    (["source", "target"] as const).map(async (end) => {
      const anchor = end === "source" ? hit.sourceAnchor : hit.targetAnchor;
      const point = end === "source" ? hit.sourcePoint : hit.targetPoint;
      const left = Math.max(0, Math.min(metadata.width! - 96, Math.round(anchor.x - 48)));
      const top = Math.max(0, Math.min(metadata.height! - 96, Math.round(anchor.y - 48)));
      const mark = Buffer.from(
        `<svg width="384" height="384"><circle cx="${(point.x - left) * 4}" cy="${(point.y - top) * 4}" r="9" stroke="#ef4444" stroke-width="2" fill="none"/><path d="M${(anchor.x - left) * 4 - 7} ${(anchor.y - top) * 4}h14m-7 -7v14" stroke="#006cff" stroke-width="2"/></svg>`,
      );
      return sharp(image)
        .extract({ left, top, width: 96, height: 96 })
        .resize(384, 384, { kernel: "nearest" })
        .composite([{ input: mark }])
        .png()
        .toBuffer();
    }),
  );
  const label = Buffer.from(
    `<svg width="792" height="72"><rect width="792" height="72" fill="white"/><g font-family="Arial" font-size="12" fill="#111827"><text x="8" y="16">${xml(hit.id)} | ${seconds.toFixed(3)}s | 4x actual Electron crop</text><text x="8" y="34">${xml(hit.sourceKey)} -&gt; ${xml(hit.targetKey)}</text><text x="8" y="52">source ${hit.sourceError.toFixed(6)}px / target ${hit.targetError.toFixed(6)}px | red circle: SVG endpoint | blue cross: DOM anchor</text><text x="8" y="68">SOURCE</text><text x="408" y="68">TARGET</text></g></svg>`,
  );
  const filename = `${hit.id.replace(/[^a-zA-Z0-9_-]/g, "-")}.png`;
  await sharp({ create: { width: 792, height: 456, channels: 3, background: "white" } })
    .composite([
      { input: label, left: 0, top: 0 },
      { input: panels[0]!, left: 0, top: 72 },
      { input: panels[1]!, left: 408, top: 72 },
    ])
    .png()
    .toFile(join(directory, filename));
  return filename;
}
export async function writeCurveEvidence(
  output: string,
  frames: readonly CurveFrameRecord[],
  zooms: ReadonlyMap<string, string>,
) {
  await mkdir(output, { recursive: true });
  const summary = summarizeCurveFrames(frames);
  await writeFile(
    join(output, "curve-hits.json"),
    JSON.stringify({
      thresholdCssPixels: 1,
      method:
        "actual painted SVG getPointAtLength -> getScreenCTM -> independent DOM bounding-box centers; prototype semantic oracle; no renderer endpoint telemetry",
      summary,
      frames,
    }),
  );
  await writeFile(join(output, "curve-summary.json"), JSON.stringify(summary, null, 2));
  await writeFile(
    join(output, "curve-pairings.md"),
    [
      "# Observed semantic curve pairings",
      "",
      "Traveling light heads are in transit; endpoint errors concern the authored cubic path. Landing heads are checked separately once progress reaches 1. Future targets use the ID-bound ghost of that exact event, never a nearest neighbor.",
      "",
      "| Curve | Event | Source anchor | Target anchor | Samples | Max px | Mean px | Wrong pairs |",
      "|---|---|---|---|---:|---:|---:|---:|",
      ...summary.curves.map(
        (c) =>
          `| ${c.id} | ${c.eventId} | ${c.source} | ${c.target} | ${c.samples} | ${c.maximumError.toFixed(6)} | ${c.averageEndpointError.toFixed(6)} | ${c.wrongPairs} |`,
      ),
    ].join("\n") + "\n",
  );
  await mkdir(join(output, "curve-zoom"), { recursive: true });
  await writeFile(
    join(output, "curve-zoom", "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Curve endpoint zooms</title><style>body{font:14px system-ui;background:#eef1f4}img{max-width:100%;display:block;margin:10px 0}</style><h1>Actual SVG endpoints vs DOM anchors</h1><p>Red circle = path endpoint. Blue cross = independently measured DOM center. One 4x frame crop for each observed route.</p>${[...zooms].map(([id, file]) => `<section><h2>${xml(id)}</h2><a href="${file}"><img loading="lazy" src="${file}"></a></section>`).join("\n")}`,
  );
  return summary;
}
