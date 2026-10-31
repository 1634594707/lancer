import { expect, test } from "@playwright/test";
import type { RelayArtifact } from "../../contracts/relay-tree";
import { VIDEO_LEARN_PROCESS_ID, type VideoLearnSnapshot } from "../../contracts/video-learn";
import { videoDeliverables } from "../../src/features/conversation/lancer-process/video-deliverables";

const artifact: RelayArtifact = {
  step: "download",
  path: "raw/videos/task/source.mp4",
  sha256: "a".repeat(64),
  timestamp: "2026-01-01T00:00:00Z",
  status: "passed",
  statusCode: "download.ok",
};
const remake: RelayArtifact = {
  ...artifact,
  step: "remake",
  path: "remake/out/task/run/export-1/animation.mp4",
  runId: "run",
  sha256: "b".repeat(64),
  statusCode: "remake.ok",
};
const snapshot = (artifacts: readonly RelayArtifact[]): VideoLearnSnapshot => ({
  processId: VIDEO_LEARN_PROCESS_ID,
  projectRoot: "/fixture",
  videoId: "task",
  douyinUrl: "",
  guiStatus: "FAILED", // Later failures do not hide an already delivered source.
  stages: [],
  handoff: null,
  errorCode: "E_MODEL_FAIL",
  sessions: [],
  sessionError: null,
  relayTree: { gates: [], models: {}, artifacts },
});

test("download gate exposes only source video, never manifest or intermediate work", () => {
  expect(videoDeliverables(null)).toEqual([]);
  expect(videoDeliverables(snapshot([]))).toEqual([]);
  const products = videoDeliverables(
    snapshot([
      artifact,
      { ...artifact, path: "raw/videos/task/meta.json" },
      { ...artifact, step: "analysis", path: "learning/task/spec.json", statusCode: "analysis.ok" },
      { ...remake, path: "remake/out/task/run/scene.js" },
    ]),
  );
  expect(products.map((product) => product.title)).toEqual(["原视频"]);
  expect(products[0]).toMatchObject({ path: artifact.path, sha256: artifact.sha256 });
});

test("only verified, passed video outputs are delivered; retries do not erase prior success", () => {
  for (const status of ["failed", "running", "unverified"] as const) {
    expect(videoDeliverables(snapshot([{ ...remake, status }]))).toEqual([]);
  }
  for (const changed of [
    { statusCode: "remake.fail" },
    { statusCode: "running" },
    { sha256: "invalid" },
  ])
    expect(videoDeliverables(snapshot([{ ...remake, ...changed }]))).toEqual([]);
  expect(
    videoDeliverables(
      snapshot([
        remake,
        { ...remake, status: "failed", timestamp: "2026-01-03T00:00:00Z" },
        artifact,
      ]),
    ).map((product) => product.title),
  ).toEqual(["原视频", "复刻视频"]);
});

test("reused identical products deduplicate; distinct finished videos retain their run identity", () => {
  const products = videoDeliverables(
    snapshot([
      artifact,
      { ...artifact, gatePath: "_gates/download.retry.json", timestamp: "2026-01-02T00:00:00Z" },
      remake,
      {
        ...remake,
        runId: "second",
        path: "remake/out/task/second/export-1/animation.mp4",
        sha256: "c".repeat(64),
        timestamp: "2026-01-04T00:00:00Z",
      },
    ]),
  );
  expect(products).toHaveLength(3);
  expect(products.map((product) => product.runId)).toEqual([undefined, "second", "run"]);
  expect(products[0]!.timestamp).toBe("2026-01-02T00:00:00Z");
  expect(videoDeliverables({ ...snapshot([artifact]), videoId: "" })).toEqual([]);
});
