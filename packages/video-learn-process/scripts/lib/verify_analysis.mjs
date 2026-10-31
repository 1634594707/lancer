/** Read-only acceptance: all identities and references must agree with current bytes. */
import fs from "node:fs";
import path from "node:path";
import { readJson, sha256File } from "./project.mjs";
import { validateSchema } from "./schema_check.mjs";

export function verifyAnalysis(projectRoot, videoId) {
  if (!/^[A-Za-z0-9_-]+$/.test(videoId)) throw new Error("INVALID_VIDEO_ID");
  const root = fs.realpathSync(projectRoot);
  const require = (condition, reason) => {
    if (!condition) throw new Error(reason);
  };
  function file(relative) {
    require(typeof relative === "string" && !path.isAbsolute(relative), "PATH_NOT_RELATIVE");
    const absolute = fs.realpathSync(path.resolve(root, relative));
    require(absolute.startsWith(root + path.sep), "PATH_OUTSIDE_PROJECT");
    require(fs.statSync(absolute).isFile(), "NOT_A_FILE");
    return absolute;
  }
  const json = (relative) => readJson(file(relative));
  function validate(schema, value) {
    const result = validateSchema(schema, value);
    require(result.ok, `${schema}: ${result.errors.join("; ")}`);
  }
  const manifest = json(`raw/videos/${videoId}/meta.json`);
  validate("manifest.schema.json", manifest);
  require(manifest.video_id === videoId &&
    manifest.status_code === "download.ok", "DOWNLOAD_ID_STATUS");
  const source = file(manifest.local_path);
  const sourceHash = sha256File(source);
  require(sourceHash === manifest.sha256 &&
    fs.statSync(source).size === manifest.byte_size, "SOURCE_HASH_SIZE_MISMATCH");
  const gates = ["download", "media", "analysis"].map((step) => {
    const gate = json(`_gates/${step}.${videoId}.json`);
    require(gate.video_id === videoId &&
      gate.status_code === `${step}.ok`, `MISSING_${step.toUpperCase()}_OK`);
    require(gate.sha256 === sourceHash && gate.error_code == null, `${step}: HASH_OR_ERROR`);
    return gate;
  });
  const media = json(`raw/videos/${videoId}/media.json`);
  validate("media.schema.json", media);
  require(media.video_id === videoId &&
    media.source_sha256 === sourceHash, "MEDIA_SOURCE_MISMATCH");
  const frames = json(`learning/${videoId}/frames.json`);
  validate("frames.schema.json", frames);
  require(frames.video_id === videoId &&
    frames.source_sha256 === sourceHash, "FRAMES_SOURCE_MISMATCH");
  const indexes = new Map();
  for (const frame of frames.frames) {
    require(!indexes.has(frame.frame_index), "DUPLICATE_FRAME_INDEX");
    require(frame.frame_index < media.frame_count &&
      frame.pts_ms <= media.duration_ms, "FRAME_OUT_OF_MEDIA_RANGE");
    require(sha256File(file(frame.path)) === frame.sha256, "FRAME_HASH_MISMATCH");
    indexes.set(frame.frame_index, frame);
  }
  const spec = json(`learning/${videoId}/spec.json`);
  validate("learning_spec.schema.json", spec);
  const analysisGate = gates[2];
  const specPath = `learning/${videoId}/spec.json`;
  const receiptPath = `learning/${videoId}/analysis-receipt.json`;
  require(analysisGate.artifacts?.learning_spec === specPath &&
    analysisGate.artifacts?.receipt === receiptPath, "ANALYSIS_ARTIFACT_PATH_MISMATCH");
  require(analysisGate.learning_spec_sha256 ===
    sha256File(file(specPath)), "ANALYSIS_SPEC_HASH_MISMATCH");
  require(analysisGate.receipt_sha256 ===
    sha256File(file(receiptPath)), "ANALYSIS_RECEIPT_HASH_MISMATCH");
  const receipt = json(receiptPath);
  validate("analysis_receipt.schema.json", receipt);
  require(receipt.provider === spec.model.provider &&
    receipt.model === spec.model.id, "ANALYSIS_MODEL_MISMATCH");
  require(receipt.submitted_frames.length === indexes.size, "SUBMITTED_FRAMES_COUNT_MISMATCH");
  const submitted = new Set();
  for (const reference of receipt.submitted_frames) {
    const frame = indexes.get(reference.frame_index);
    require(!submitted.has(reference.frame_index) &&
      frame &&
      frame.pts_ms === reference.pts_ms &&
      frame.sha256 === reference.sha256, "E_MODEL_BAD_REF");
    submitted.add(reference.frame_index);
  }

  require(spec.video_id === videoId &&
    spec.source_sha256 === sourceHash &&
    spec.source_path === manifest.local_path, "ANALYSIS_SOURCE_MISMATCH");
  for (const field of ["duration_ms", "fps", "frame_count"])
    require(spec[field] === media[field], `ANALYSIS_MEDIA_MISMATCH:${field}`);
  for (const conclusion of spec.conclusions) {
    const frame = indexes.get(conclusion.frame_index);
    require(frame &&
      frame.pts_ms === conclusion.pts_ms &&
      frame.sha256 === conclusion.sha256, "E_MODEL_BAD_REF");
    require(conclusion.observation.trim().length > 0 &&
      !/MECH_PROBE/.test(conclusion.observation), "E_MODEL_FAIL");
  }
  // Timestamps alone do not prove execution, but reject internally reversed receipts.
  const times = gates.map((gate) => Date.parse(gate.ts));
  require(times.every(Number.isFinite) &&
    times[0] <= times[1] &&
    times[1] <= times[2], "GATE_ORDER_INVALID");
  require(Date.parse(receipt.ts) >= times[1] &&
    Date.parse(receipt.ts) <= times[2], "RECEIPT_TIME_INVALID");
  return {
    videoId,
    sourceHash,
    frameCount: frames.frames.length,
    conclusions: spec.conclusions.length,
    model: spec.model,
  };
}
