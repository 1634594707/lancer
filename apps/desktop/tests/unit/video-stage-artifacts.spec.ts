import { expect, test } from "@playwright/test";
import type { VideoLearnSnapshot } from "../../contracts/video-learn";
import type { RelayArtifact } from "../../contracts/relay-tree";
import { videoLearnStageArtifacts } from "../../src/features/conversation/video-learn-stages";

test("inline media stages do not mix old failed attempts into the current successful run", () => {
  const makeArtifact = (id: string, status: RelayArtifact["status"]): RelayArtifact => ({
    step: "media",
    path: `learning/${id}/frames.json`,
    gatePath: `_gates/media.${id}.json`,
    sha256: "verified-hash",
    timestamp: "2026-10-30T00:00:00Z",
    status,
  });
  const current = makeArtifact("current", "passed");
  const artifacts = [
    current,
    makeArtifact("older-failed", "failed"),
    makeArtifact("older-passed", "passed"),
  ];
  const snapshot: VideoLearnSnapshot = {
    processId: "lancer.video_learn_remake.v1",
    projectRoot: "/project",
    videoId: "current",
    douyinUrl: "",
    guiStatus: "MEDIA_READY",
    stages: [],
    handoff: null,
    errorCode: null,
    sessions: [],
    sessionError: null,
    relayTree: { artifacts, gates: [], models: {} },
  };
  expect(videoLearnStageArtifacts(snapshot, "media")).toEqual([current]);
  expect(videoLearnStageArtifacts(snapshot, "analysis")).toEqual([]);
  expect(snapshot.relayTree!.artifacts).toHaveLength(3);
});
