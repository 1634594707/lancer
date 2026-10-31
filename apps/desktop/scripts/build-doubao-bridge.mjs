import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--output")) {
  throw new Error("Usage: node scripts/build-doubao-bridge.mjs [--output PATH]");
}
if (process.platform !== "darwin") {
  console.log("Doubao native bridge is macOS-only; no helper built on this platform.");
} else {
  const output = path.resolve(root, args[1] ?? "apps/desktop/build/native/lancer-doubao-bridge");
  mkdirSync(path.dirname(output), { recursive: true });
  const result = spawnSync(
    "/usr/bin/xcrun",
    [
      "swiftc",
      "-O",
      "-framework",
      "AppKit",
      "-framework",
      "ApplicationServices",
      "-framework",
      "AVFoundation",
      path.join(root, "apps/desktop/native/doubao-bridge.swift"),
      "-o",
      output,
    ],
    { stdio: "inherit", timeout: 120_000, env: process.env },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  const parserCheck = spawnSync(output, ["--parser-self-test"], {
    stdio: "inherit",
    timeout: 10_000,
  });
  if (parserCheck.error) throw parserCheck.error;
  if (parserCheck.status !== 0) process.exit(parserCheck.status ?? 1);
  console.log(`Built ${output}`);
}
