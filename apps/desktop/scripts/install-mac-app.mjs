import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, renameSync, mkdtempSync } from "node:fs";
import path from "node:path";

const candidate = path.resolve(process.argv[2] ?? "");
const destination = "/Applications/Lancer.app";
const migrate = process.argv.includes("--migrate-signing");
function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function requirement(app) {
  // codesign emits the requirement on stdout and diagnostics on stderr.
  const result = spawnDisplay(app);
  const value = result.match(/^(?:# )?designated => (.+)$/m)?.[1];
  if (!value) throw new Error("Missing designated requirement");
  return value;
}
function spawnDisplay(app) {
  const result = spawnSync("codesign", ["-d", "-r-", app], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return `${result.stdout}\n${result.stderr}`;
}
if (process.platform !== "darwin" || !process.argv[2] || candidate === destination) {
  throw new Error("Usage: node install-mac-app.mjs <candidate.app> [--migrate-signing]");
}
run("codesign", ["--verify", "--deep", "--strict", candidate]);
const next = requirement(candidate);
if (/cdhash/.test(next) || !/anchor|certificate/.test(next)) {
  throw new Error("Refusing a non-persistent signing identity");
}
const id = run("/usr/libexec/PlistBuddy", [
  "-c",
  "Print :CFBundleIdentifier",
  `${candidate}/Contents/Info.plist`,
]).trim();
if (id !== "com.lancer.desktop") throw new Error("Unexpected bundle identifier");
if (existsSync(destination)) {
  const previous = requirement(destination);
  if (previous !== next && !(migrate && /cdhash/.test(previous))) {
    throw new Error(
      "Signing identity changed; refusing replacement. Initial ad-hoc migration requires --migrate-signing.",
    );
  }
}
const processes = run("ps", ["-axo", "command="]);
if (processes.split("\n").some((line) => line.startsWith(`${destination}/Contents/MacOS/Lancer`))) {
  throw new Error("Quit Lancer normally before installing; the installer never kills it.");
}
const staging = mkdtempSync("/Applications/.lancer-update-");
const staged = path.join(staging, "Lancer.app");
const backup = path.join(staging, "previous-Lancer.app");
run("ditto", [candidate, staged]);
run("codesign", ["--verify", "--deep", "--strict", staged]);
if (requirement(staged) !== next) throw new Error("Staged signing identity mismatch");
let backedUp = false;
try {
  if (existsSync(destination)) {
    renameSync(destination, backup);
    backedUp = true;
  }
  renameSync(staged, destination);
} catch (error) {
  if (backedUp && !existsSync(destination)) renameSync(backup, destination);
  throw error;
}
console.log(
  JSON.stringify({ installed: destination, backup: backedUp ? backup : null, requirement: next }),
);
