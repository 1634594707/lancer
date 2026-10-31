import type { VideoLearnSnapshot, VideoLearnStage } from "../../../contracts/video-learn";
import { modelFamily } from "../../ui/model-families";
import type { ProcessEvent, ProcessMessage } from "./lancer-process/process-types";

/** The tree retains older attempts; an inline stage describes this run only. */
export function videoLearnStageArtifacts(
  snapshot: VideoLearnSnapshot,
  stage: VideoLearnStage["id"],
) {
  const gatePath = `_gates/${stage}.${snapshot.videoId}.json`;
  return (
    snapshot.relayTree?.artifacts.filter(
      (artifact) => artifact.step === stage && artifact.gatePath === gatePath,
    ) ?? []
  );
}

/** One short line of ids, paths, hashes, and status codes. No narrative and no media bytes. */
export function videoLearnStageDetail(
  snapshot: VideoLearnSnapshot,
  stage: VideoLearnStage,
): string {
  if (stage.id === "handoff" && snapshot.handoff) {
    const handoff = snapshot.handoff;
    return `video_id=${handoff.videoId} status=${handoff.statusCode} sha256=${handoff.sha256} manifest=${handoff.manifest} source=${handoff.source}`;
  }
  const sha = snapshot.handoff?.sha256 ? ` sha256=${snapshot.handoff.sha256}` : "";
  const error = snapshot.errorCode ? ` error=${snapshot.errorCode}` : "";
  return `video_id=${snapshot.videoId} status=${stage.statusCode}${sha}${error}`;
}

// Live process time is a layout coordinate in the 0–26.5 viewport, not elapsed seconds.
export function videoLearnProcessMessages(snapshot: VideoLearnSnapshot): ProcessMessage[] {
  return snapshot.stages
    .filter((stage) => stage.id !== "ingest")
    .map((stage, index) => ({
      id: `video-learn:${snapshot.videoId}:${stage.id}`,
      eventId: `video-learn-event:${snapshot.videoId}:${stage.id}`,
      kind: "event" as const,
      time: 2 + index * 4,
      steps: [
        {
          id: `video-learn:${snapshot.videoId}:${stage.id}:step`,
          kind:
            stage.id === "analysis" || stage.id === "watch" ? ("read" as const) : ("run" as const),
          label: `${stage.model ?? stage.actor} · ${stage.guiLabel}`,
          duration: "",
          detail: videoLearnStageDetail(snapshot, stage),
        },
      ],
    }));
}

export function videoLearnProcessEvents(snapshot: VideoLearnSnapshot): ProcessEvent[] {
  return snapshot.stages
    .filter((stage) => stage.id !== "ingest")
    .map((stage, index) => ({
      id: `video-learn-event:${snapshot.videoId}:${stage.id}`,
      index,
      time: 2 + index * 4,
      lane: "v",
      modelFamily: modelFamily("", stage.model)?.id,
      kind:
        stage.id === "handoff"
          ? "handoff"
          : stage.id === "analysis" || stage.id === "watch"
            ? "artifact"
            : "tool",
      actor:
        stage.id === "handoff"
          ? "video-handoff"
          : stage.actor === "gateway"
            ? "video-gateway"
            : "video-local",
      ...(stage.id === "handoff" ? { targetActor: "video-handoff" } : {}),
      label: `${stage.model ?? ""} ${stage.guiLabel}`.trim(),
      summary: videoLearnStageDetail(snapshot, stage),
      running: stage.running,
      fail: !stage.ok && !stage.running,
    }));
}
