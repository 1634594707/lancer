#!/usr/bin/env node
/** Retained CLI name. Read-only verifier; cannot mint watch.ok or bypass media/analysis. */
if (process.argv.includes("--spec") || process.argv.includes("--write-placeholder")) {
  console.error("Legacy watch writer disabled. Run the real media/analysis pipeline first.");
  process.exit(2);
}
await import("./accept_download_watch.mjs");
