#!/usr/bin/env node
/**
 * Validate a learning_spec JSON against schemas/learning_spec.schema.json (light + optional jsonschema).
 * Usage: node scripts/validate_learning_spec.mjs <path-or--> [--project-root DIR]
 *   If path omitted, uses learning/<id>/spec.json with --video-id
 */
import path from "path";
import { resolveProjectRoot, argValue, readJson } from "./lib/project.mjs";
import { validateLearningSpecFull } from "./lib/schema_check.mjs";

const argv = process.argv.slice(2);
const projectRoot = resolveProjectRoot(argv);
const videoId = argValue(argv, "--video-id");
let specPath = argv.find(
  (a) => !a.startsWith("--") && a !== argValue(argv, "--project-root") && a !== videoId,
);
if (!specPath && videoId) specPath = path.join(projectRoot, "learning", videoId, "spec.json");
if (!specPath) {
  console.error(
    "usage: validate_learning_spec.mjs <spec.json> | --video-id ID [--project-root DIR]",
  );
  process.exit(2);
}
if (argValue(argv, "--project-root") && specPath === argValue(argv, "--project-root")) {
  /* ignore */
}
const abs = path.isAbsolute(specPath) ? specPath : path.resolve(specPath);
const obj = readJson(abs);
const r = validateLearningSpecFull(obj);
if (!r.ok) {
  console.error("INVALID", abs);
  for (const e of r.errors) console.error(" -", e);
  process.exit(1);
}
console.log("OK learning_spec", abs);
process.exit(0);
