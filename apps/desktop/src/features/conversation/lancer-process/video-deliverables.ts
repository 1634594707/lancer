import type { VideoLearnSnapshot } from "../../../../contracts/video-learn";

export interface VideoDeliverable {
  readonly id: string;
  readonly title: "原视频" | "复刻视频";
  readonly videoId: string;
  readonly path: string;
  readonly sha256: string;
  readonly timestamp: string;
  readonly runId?: string;
}

/** Product projection only: a completed gate without an actual video is not a delivery. */
export function videoDeliverables(
  snapshot?: VideoLearnSnapshot | null,
): readonly VideoDeliverable[] {
  if (!snapshot?.videoId) return [];
  const artifacts = snapshot.relayTree?.artifacts ?? [];
  const products = new Map<string, VideoDeliverable>();
  for (const artifact of [...artifacts].sort((a, b) => b.timestamp.localeCompare(a.timestamp))) {
    if (artifact.status !== "passed" || !/^[a-f0-9]{64}$/i.test(artifact.sha256)) continue;
    const source =
      artifact.step === "download" &&
      artifact.statusCode === "download.ok" &&
      artifact.path.endsWith("/source.mp4");
    const remake =
      artifact.step === "remake" &&
      artifact.statusCode === "remake.ok" &&
      /\.mp4$/i.test(artifact.path);
    if (!source && !remake) continue;
    const title = source ? "原视频" : "复刻视频";
    const id = `${title}:${artifact.sha256.toLowerCase()}`;
    if (products.has(id)) continue; // Reused evidence is one product, not another process row.
    products.set(id, {
      id,
      title,
      videoId: snapshot.videoId,
      path: artifact.path,
      sha256: artifact.sha256,
      timestamp: artifact.timestamp,
      runId: artifact.runId,
    });
  }
  return [...products.values()].sort((a, b) =>
    a.title === b.title ? b.timestamp.localeCompare(a.timestamp) : a.title === "原视频" ? -1 : 1,
  );
}
