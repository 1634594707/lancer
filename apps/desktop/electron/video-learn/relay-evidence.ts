import { readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type {
  RelayArtifact,
  RelayGate,
  RelayStep,
  RelayTreeEvidence,
} from "../../contracts/relay-tree";
import { readJson, sha256File } from "./io";

const steps: readonly RelayStep[] = ["download", "media", "analysis", "handoff", "remake"];
/** Read-only, project-contained inventory. Retained run directories remain separate attempts. */
export async function readRelayEvidence(root: string, id: string): Promise<RelayTreeEvidence> {
  const gates: RelayGate[] = [];
  const artifacts: RelayArtifact[] = [];
  const models: Partial<Record<RelayStep, string>> = {};
  const base = realpathSync(root);
  const owned = (relative: string) => {
    const file = realpathSync(path.resolve(base, relative));
    const rel = path.relative(base, file);
    if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("E_BAD_ARTIFACT_PATH");
    return file;
  };
  for (const step of steps) {
    const gate = readJson(path.join(base, "_gates", `${step}.${id}.json`));
    if (gate?.video_id !== id || gate.step !== step || typeof gate.status_code !== "string")
      continue;
    const refs: Record<string, string> = {};
    if (gate.artifacts && typeof gate.artifacts === "object")
      for (const [key, value] of Object.entries(gate.artifacts))
        if (typeof value === "string") refs[key] = value;
    gates.push({
      step,
      statusCode: gate.status_code,
      timestamp: String(gate.ts ?? ""),
      ...(typeof gate.error_code === "string" ? { errorCode: gate.error_code } : {}),
      artifacts: refs,
    });
    if (typeof gate.model === "string") models[step] = gate.model;
    if (step === "download") models.download = "本地导入";
    if (step === "media") models.media = "本地";
  }
  const analysis = readJson(path.join(base, "learning", id, "analysis-receipt.json"));
  if (typeof analysis?.model === "string") models.analysis = analysis.model;
  const add = async (
    step: RelayStep,
    relative: string,
    gate?: RelayGate,
    model?: string,
    startedAt?: string,
    evidenceGatePath?: string,
  ) => {
    try {
      const file = owned(relative);
      const stats = statSync(file);
      if (!stats.isFile()) return;
      artifacts.push({
        step,
        path: relative,
        sha256: await sha256File(file),
        timestamp: gate?.timestamp || stats.mtime.toISOString(),
        gatePath: gate
          ? (evidenceGatePath ??
            (relative.startsWith("_gates/") ? relative : `_gates/${step}.${id}.json`))
          : undefined,
        mtime: stats.mtime.toISOString(),
        startedAt:
          startedAt ??
          (step === "media"
            ? gates.find((g) => g.step === "download")?.timestamp
            : step === "analysis"
              ? gates.find((g) => g.step === "media")?.timestamp
              : step === "handoff"
                ? gates.find((g) => g.step === "analysis")?.timestamp
                : undefined),
        status: gate?.statusCode.endsWith(".ok")
          ? "passed"
          : !gate || gate.statusCode === "unverified"
            ? "unverified"
            : gate.statusCode === "running"
              ? "running"
              : "failed",
        statusCode: gate?.statusCode ?? "unverified",
        ...(step === "remake" ? { runId: relative.split("/")[3] } : {}),
        ...(gate?.errorCode ? { errorCode: gate.errorCode } : {}),
        ...(model ? { model } : {}),
      });
    } catch {
      /* Missing or escaping paths are not evidence of a produced artifact. */
    }
  };
  for (const gate of gates) {
    if (gate.errorCode)
      await add(gate.step, `_gates/${gate.step}.${id}.json`, gate, models[gate.step]);
    const wanted = {
      download: ["source", "manifest"],
      media: ["frames", "media"],
      analysis: ["learning_spec", "receipt"],
      handoff: ["lessons"],
      remake: [],
    }[gate.step];
    for (const key of wanted)
      if (gate.artifacts[key]) await add(gate.step, gate.artifacts[key]!, gate, models[gate.step]);
    const extra =
      gate.step === "analysis"
        ? ["analysis-response.json"]
        : gate.step === "handoff"
          ? ["handoff.json", "handoff-response.json"]
          : [];
    for (const name of extra)
      await add(gate.step, `learning/${id}/${name}`, gate, models[gate.step]);
  }
  const remakeDir = `remake/out/${id}`;
  let runs: string[] = [];
  try {
    runs = readdirSync(owned(remakeDir)).sort();
  } catch {
    /* No remake yet. */
  }
  const state = readJson(path.join(base, remakeDir, "current.json"));
  for (const run of runs) {
    const dir = `${remakeDir}/${run}`;
    try {
      if (!statSync(owned(dir)).isDirectory()) continue;
    } catch {
      continue;
    }
    const receipt = readJson(path.join(base, dir, "terra-receipt.json"));
    const model = typeof receipt?.model === "string" ? receipt.model : undefined;
    if (model && state?.runDir === dir) models.remake = model;
    const isCurrent = state?.runDir === dir;
    const gate = gates.find(
      (g) => g.step === "remake" && Object.values(g.artifacts).some((p) => p.startsWith(`${dir}/`)),
    );
    // A receipt or current.json cannot stand in for the run's gate.
    for (const name of ["scene.js", "frames.json", "terra-receipt.json"])
      await add("remake", `${dir}/${name}`, gate, model);
    const sol = readJson(path.join(base, dir, "sol-receipt.json"));
    await add(
      "remake",
      `${dir}/sol-receipt.json`,
      gate,
      typeof sol?.model === "string" ? sol.model : undefined,
    );
    if (isCurrent && typeof sol?.model === "string")
      models.remake = [model, sol.model].filter(Boolean).join(" + ");
    let exports: string[] = [];
    try {
      exports = readdirSync(owned(dir))
        .filter((name) => name.startsWith("export-"))
        .sort();
    } catch {
      /* No export. */
    }
    for (const exp of exports) await add("remake", `${dir}/${exp}/animation.mp4`, gate, model);
  }
  // Every retained attempt sharing the verified source identity belongs to this relay.
  const source = readJson(path.join(base, "raw/videos", id, "meta.json"))?.sha256;
  if (typeof source === "string") {
    for (const name of readdirSync(path.join(base, "_gates")).sort()) {
      if (!/^(download|media|analysis|handoff)\..+\.json$/.test(name) || name.includes(`.${id}.`))
        continue;
      const g = readJson(path.join(base, "_gates", name));
      if (!g) continue;
      const priorId =
        typeof g?.video_id === "string" && /^[A-Za-z0-9_-]+$/.test(g.video_id) ? g.video_id : "";
      const priorDownload = priorId
        ? readJson(path.join(base, "_gates", `download.${priorId}.json`))
        : null;
      if (g?.sha256 !== source && g?.source_sha256 !== source && priorDownload?.sha256 !== source)
        continue;
      if (
        g.step !== "download" &&
        g.step !== "media" &&
        g.step !== "analysis" &&
        g.step !== "handoff"
      )
        continue;
      if (g.status_code !== `${g.step}.ok` && g.status_code !== `${g.step}.fail`) continue;
      const refs: Record<string, string> = {};
      for (const [key, value] of Object.entries(
        g.artifacts && typeof g.artifacts === "object" ? g.artifacts : {},
      ))
        if (typeof value === "string") refs[key] = value;
      const previous =
        g.step === "media"
          ? priorDownload
          : g.step === "analysis"
            ? readJson(path.join(base, "_gates", `media.${priorId}.json`))
            : g.step === "handoff"
              ? readJson(path.join(base, "_gates", `analysis.${priorId}.json`))
              : null;
      const startedAt = typeof previous?.ts === "string" ? previous.ts : undefined;
      const receipt =
        g.step === "analysis"
          ? readJson(path.join(base, "learning", priorId, "analysis-receipt.json"))
          : null;
      const model =
        typeof g.model === "string"
          ? g.model
          : typeof receipt?.model === "string"
            ? receipt.model
            : undefined;
      const prior: RelayGate = {
        step: g.step,
        timestamp: String(g.ts ?? ""),
        statusCode: String(g.status_code),
        ...(typeof g.error_code === "string" ? { errorCode: g.error_code } : {}),
        artifacts: refs,
      };
      const gatePath = `_gates/${name}`;
      const before = artifacts.length;
      if (prior.errorCode) await add(g.step, gatePath, prior, model, startedAt, gatePath);
      const wanted = {
        download: ["source", "manifest"],
        media: ["frames", "media"],
        analysis: ["learning_spec", "receipt"],
        handoff: ["lessons"],
      }[g.step];
      for (const key of wanted)
        if (refs[key]) await add(g.step, refs[key]!, prior, model, startedAt, gatePath);
      const extra =
        g.step === "analysis"
          ? ["analysis-response.json"]
          : g.step === "handoff"
            ? ["handoff.json", "handoff-response.json"]
            : [];
      for (const file of extra)
        await add(g.step, `learning/${priorId}/${file}`, prior, model, startedAt, gatePath);
      if (artifacts.length === before)
        await add(g.step, gatePath, prior, model, startedAt, gatePath);
    }
  }
  return { gates, artifacts, models };
}
