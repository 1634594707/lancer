import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Real decoded media, generated on demand; no binary fixture is checked into Git. */
export function makeVideoLearnFixture(
  directory: string,
  ffmpegPath: string,
  sceneSeconds = 2,
): string {
  mkdirSync(directory, { recursive: true });
  const output = path.join(directory, "two-scenes-with-audio.mp4");
  execFileSync(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=160x90:rate=12:duration=${sceneSeconds}`,
      "-f",
      "lavfi",
      "-i",
      `color=c=blue:size=160x90:rate=12:duration=${sceneSeconds}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:sample_rate=44100:duration=${sceneSeconds * 2}`,
      "-filter_complex",
      "[0:v]format=yuv420p[v0];[1:v]format=yuv420p[v1];[v0][v1]concat=n=2:v=1:a=0[v]",
      "-map",
      "[v]",
      "-map",
      "2:a",
      "-c:v",
      "mpeg4",
      "-q:v",
      "3",
      "-c:a",
      "aac",
      "-shortest",
      output,
    ],
    { encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 },
  );
  return output;
}

export function makeVideoPassRoot(prefix: "unit" | "live" = "unit"): string {
  const base = path.resolve(process.env.LANCER_VIDEO_PASS_OUTPUT ?? ".artifacts/video-pass");
  mkdirSync(base, { recursive: true });
  return mkdtempSync(path.join(base, `${prefix}-`));
}

export function fixtureSha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function writeVideoPassEvidence(root: string, name: string, evidence: unknown): void {
  writeFileSync(path.join(root, `${name}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
}
