import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { record, sha256File, VideoPassError, writeJson } from "./io";
import { runMediaOperation, type MediaOperationListener } from "./media-operations";

export const DEFAULT_SCENE_THRESHOLD = 0.3;
export const DEFAULT_FRAME_INTERVAL_SECONDS = 5;

export interface MediaOptions {
  readonly onOperation?: MediaOperationListener;
  readonly ffprobePath?: string;
  readonly ffmpegPath?: string;
  readonly commandTimeoutMs?: number;
  readonly frameIntervalSeconds?: number;
  readonly sceneThreshold?: number;
  readonly maxFrames?: number;
}
export interface FrameRef {
  readonly frame_index: number;
  readonly pts_ms: number;
  readonly path: string;
  readonly sha256: string;
}
interface FrameTime {
  readonly frame_index: number;
  readonly pts_ms: number;
  readonly key_frame: boolean;
}
export interface MediaProbe {
  readonly duration_ms: number;
  readonly fps: number;
  readonly frame_count: number;
  readonly width: number;
  readonly height: number;
  readonly keyframes: readonly { frame_index: number; pts_ms: number }[];
  readonly audio: { codec: string; sample_rate: number; channels: number } | null;
  readonly frames: readonly FrameTime[];
}
const positive = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new VideoPassError("E_PROBE_FAIL");
  return n;
};
export async function probeMedia(source: string, options: MediaOptions = {}): Promise<MediaProbe> {
  const bin = options.ffprobePath ?? process.env.FFPROBE ?? "ffprobe";
  const timeout = options.commandTimeoutMs ?? 120_000;
  const result = await runMediaOperation(
    "probe",
    "读取视频信息",
    bin,
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", source],
    timeout,
    options.onOperation,
  );
  if (result.stderr.trim()) throw new VideoPassError("E_PROBE_FAIL");
  let data: Record<string, unknown> | null;
  try {
    data = record(JSON.parse(result.stdout));
  } catch {
    throw new VideoPassError("E_PROBE_FAIL");
  }
  const streams = Array.isArray(data?.streams) ? data.streams.map(record) : [];
  const video = streams.find((s) => s?.codec_type === "video");
  if (!video) throw new VideoPassError("E_NOT_VIDEO");
  const format = record(data?.format);
  const streamDuration = Number(video.duration);
  const duration = positive(
    Number.isFinite(streamDuration) && streamDuration > 0 ? streamDuration : format?.duration,
  );
  const ratio = String(video.avg_frame_rate ?? "")
    .split("/")
    .map(Number);
  const fps = positive(ratio.length === 2 ? ratio[0]! / ratio[1]! : ratio[0]);
  const frameResult = await runMediaOperation(
    "timestamps",
    "读取镜头时间戳",
    bin,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_frames",
      "-show_entries",
      "frame=key_frame,best_effort_timestamp_time",
      "-of",
      "json",
      source,
    ],
    timeout,
    options.onOperation,
  );
  if (frameResult.stderr.trim()) throw new VideoPassError("E_PROBE_FAIL");
  let rows: unknown;
  try {
    rows = record(JSON.parse(frameResult.stdout))?.frames;
  } catch {
    throw new VideoPassError("E_PROBE_FAIL");
  }
  if (!Array.isArray(rows) || !rows.length) throw new VideoPassError("E_PROBE_FAIL");
  const frames = rows.map((row, frame_index) => {
    const f = record(row);
    const seconds = Number(f?.best_effort_timestamp_time);
    if (!Number.isFinite(seconds) || seconds < 0) throw new VideoPassError("E_PROBE_FAIL");
    return { frame_index, pts_ms: Math.round(seconds * 1000), key_frame: f?.key_frame === 1 };
  });
  const audio = streams.find((s) => s?.codec_type === "audio");
  if (audio && (typeof audio.codec_name !== "string" || !audio.codec_name.trim()))
    throw new VideoPassError("E_PROBE_FAIL");
  return {
    duration_ms: Math.round(duration * 1000),
    fps,
    frame_count: frames.length,
    width: positive(video.width),
    height: positive(video.height),
    keyframes: frames
      .filter((f) => f.key_frame)
      .map(({ frame_index, pts_ms }) => ({ frame_index, pts_ms })),
    audio: audio
      ? {
          codec: String(audio.codec_name),
          sample_rate: positive(audio.sample_rate),
          channels: positive(audio.channels),
        }
      : null,
    frames,
  };
}
export async function extractFrames(
  root: string,
  id: string,
  source: string,
  sha: string,
  media: MediaProbe,
  options: MediaOptions = {},
): Promise<readonly FrameRef[]> {
  const interval = options.frameIntervalSeconds ?? DEFAULT_FRAME_INTERVAL_SECONDS;
  const threshold = options.sceneThreshold ?? DEFAULT_SCENE_THRESHOLD;
  const limit = options.maxFrames ?? 120;
  if (!(interval > 0) || threshold < 0 || threshold > 1 || !Number.isInteger(limit) || limit < 1)
    throw new VideoPassError("E_PROBE_FAIL");
  const dir = path.join(root, "learning", id, "frames");
  mkdirSync(dir, { recursive: true });
  const result = await runMediaOperation(
    "extract",
    "运行 ffmpeg 抽帧",
    options.ffmpegPath ?? process.env.FFMPEG ?? "ffmpeg",
    [
      "-nostdin",
      "-xerror",
      "-hide_banner",
      "-i",
      source,
      "-map",
      "0:v:0",
      "-vf",
      `select='isnan(prev_t)+gt(floor(t/${interval}),floor(prev_t/${interval}))+gt(scene,${threshold})',showinfo,scale=960:960:force_original_aspect_ratio=decrease`,
      "-fps_mode",
      "vfr",
      "-frames:v",
      String(limit + 1),
      "-q:v",
      "3",
      "-n",
      path.join(dir, "frame-%06d.jpg"),
    ],
    options.commandTimeoutMs ?? 120_000,
    options.onOperation,
  );
  const pts = [...result.stderr.matchAll(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:([\d.e+-]+)/g)].map(
    (m) => Math.round(Number(m[1]) * 1000),
  );
  if (!pts.length || pts.length > limit) throw new VideoPassError("E_PROBE_FAIL");
  const refs: FrameRef[] = [];
  for (const [i, pts_ms] of pts.entries()) {
    const frame = media.frames.find((f) => Math.abs(f.pts_ms - pts_ms) <= 1);
    if (!frame || pts_ms > media.duration_ms) throw new VideoPassError("E_PROBE_FAIL");
    const relative = `learning/${id}/frames/frame-${String(i + 1).padStart(6, "0")}.jpg`;
    const file = path.join(root, relative);
    const bytes = readFileSync(file);
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
      throw new VideoPassError("E_PROBE_FAIL");
    refs.push({
      frame_index: frame.frame_index,
      pts_ms: frame.pts_ms,
      path: relative,
      sha256: await sha256File(file),
    });
  }
  const manifest = {
    schema_version: "frames.v1",
    video_id: id,
    source_sha256: sha,
    sampling: { interval_seconds: interval, scene_threshold: threshold },
    frames: refs,
  };
  writeJson(path.join(root, "learning", id, "frames.json"), manifest);
  writeJson(path.join(root, "learning", "frames.json"), manifest);
  return refs;
}
