import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { runVideoLearnFiles } from "../../electron/video-learn/engine";
import {
  fixtureSha256,
  makeVideoLearnFixture,
  makeVideoPassRoot,
  writeVideoPassEvidence,
} from "../helpers/video-learn-fixture";

test("video pass e: real configured model analyses actual extracted frames", async () => {
  test.skip(process.env.LANCER_VIDEO_PASS_LIVE !== "1", "Explicit real gateway opt-in required");
  const providerId = process.env.LANCER_VIDEO_PASS_PROVIDER;
  const modelId = process.env.LANCER_VIDEO_PASS_MODEL;
  const agentDir =
    process.env.LANCER_VIDEO_PASS_AGENT_DIR ?? process.env.PI_APP_REAL_AUTH_SOURCE_DIR;
  if (!providerId || !modelId || !agentDir || !path.isAbsolute(agentDir)) {
    throw new Error(
      "Set LANCER_VIDEO_PASS_PROVIDER, LANCER_VIDEO_PASS_MODEL and an absolute LANCER_VIDEO_PASS_AGENT_DIR (or PI_APP_REAL_AUTH_SOURCE_DIR).",
    );
  }
  test.setTimeout(180_000);
  const root = makeVideoPassRoot("live");
  const ffmpegPath = process.env.FFMPEG ?? "ffmpeg";
  const ffprobePath = process.env.FFPROBE ?? "ffprobe";
  const source = makeVideoLearnFixture(path.join(root, "fixture"), ffmpegPath);
  const probe = JSON.parse(
    execFileSync(
      ffprobePath,
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", source],
      { encoding: "utf8", timeout: 10_000 },
    ),
  ) as {
    format: { duration: string };
    streams: Array<{ codec_type: string; r_frame_rate: string; nb_frames: string }>;
  };
  const video = probe.streams.find((stream) => stream.codec_type === "video")!;
  expect(probe.streams.some((stream) => stream.codec_type === "audio")).toBe(true);
  const result = await runVideoLearnFiles(
    root,
    { url: "https://v.douyin.com/video/7431908245560173823", localSource: source },
    {
      ffmpegPath,
      ffprobePath,
      agentDir,
      providerId,
      modelId,
      analysisTimeoutMs: 120_000,
    },
  );
  const gatePaths = Object.fromEntries(
    ["download", "media", "analysis"].map((step) => [
      step,
      path.join(root, "_gates", `${step}.${result.videoId}.json`),
    ]),
  );
  const gateValues = Object.fromEntries(
    Object.entries(gatePaths).map(([step, file]) => {
      try {
        return [step, JSON.parse(readFileSync(file, "utf8")) as unknown];
      } catch {
        return [step, null];
      }
    }),
  );
  writeVideoPassEvidence(root, "e-live", {
    proof: "real generated media + configured image model",
    source,
    sourceSha256: fixtureSha256(source),
    root,
    model: `${providerId}/${modelId}`,
    guiStatus: result.guiStatus,
    errorCode: result.errorCode,
    gatePaths,
    gateValues,
  });
  expect(result.guiStatus).toBe("ANALYZED");
  for (const step of ["download", "media", "analysis"]) {
    expect(gateValues[step]).toMatchObject({ status_code: `${step}.ok` });
  }
  const framesPath = path.join(root, "learning", result.videoId, "frames.json");
  const specPath = path.join(root, "learning", result.videoId, "spec.json");
  const frames = JSON.parse(readFileSync(framesPath, "utf8")) as {
    source_sha256: string;
    frames: Array<{ path: string; sha256: string; frame_index: number; pts_ms: number }>;
  };
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as {
    source_sha256: string;
    duration_ms: number;
    fps: number;
    frame_count: number;
    conclusions: Array<{
      frame_index: number;
      pts_ms: number;
      sha256: string;
      observation: string;
    }>;
  };
  expect(spec.source_sha256).toBe(fixtureSha256(source));
  expect(frames.source_sha256).toBe(spec.source_sha256);
  expect(
    Math.abs(spec.duration_ms - Math.round(Number(probe.format.duration) * 1000)),
  ).toBeLessThanOrEqual(50);
  const [n, d] = video.r_frame_rate.split("/").map(Number);
  expect(spec.fps).toBeCloseTo(n / d, 6);
  expect(spec.frame_count).toBe(Number(video.nb_frames));
  expect(spec.conclusions.length).toBeGreaterThan(0);
  for (const frame of frames.frames)
    expect(fixtureSha256(path.join(root, frame.path))).toBe(frame.sha256);
  for (const conclusion of spec.conclusions) {
    expect(conclusion.observation.trim().length).toBeGreaterThan(0);
    expect(frames.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          frame_index: conclusion.frame_index,
          pts_ms: conclusion.pts_ms,
          sha256: conclusion.sha256,
        }),
      ]),
    );
  }
  writeVideoPassEvidence(root, "e-live", {
    proof: "real generated media + configured image model",
    source,
    sourceSha256: spec.source_sha256,
    root,
    model: `${providerId}/${modelId}`,
    guiStatus: result.guiStatus,
    errorCode: result.errorCode,
    gatePaths,
    gateValues,
    framesPath,
    specPath,
    frameCount: frames.frames.length,
    references: spec.conclusions.map(({ frame_index, pts_ms, sha256 }) => ({
      frame_index,
      pts_ms,
      sha256,
    })),
    verified: true,
  });
});
