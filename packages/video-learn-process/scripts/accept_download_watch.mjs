#!/usr/bin/env node
/** Compatibility filename; verifies download + media + analysis, never legacy watch.ok. */
import { resolveProjectRoot, argValue } from "./lib/project.mjs";
import { verifyAnalysis } from "./lib/verify_analysis.mjs";
const argv = process.argv.slice(2);
const root = resolveProjectRoot(argv);
const videoId = argv.find(
  (arg) => !arg.startsWith("--") && arg !== argValue(argv, "--project-root"),
);
if (!videoId) {
  console.error("usage: accept_download_watch.mjs <video_id> [--project-root DIR]");
  process.exit(2);
}
try {
  const result = verifyAnalysis(root, videoId);
  console.log("ACCEPT_OK analysis endpoint", JSON.stringify(result));
} catch (error) {
  console.error("ACCEPT_FAIL", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
