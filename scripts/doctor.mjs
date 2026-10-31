import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function supportedNode(version) {
  const [major, minor] = version.split(".").map(Number);
  return major >= 22 && major < 26 && (major !== 22 || minor >= 19);
}

export function doctor({ media = false, run = spawnSync, platform = process.platform } = {}) {
  const checks = [
    { name: "Node", ok: supportedNode(process.versions.node), detail: process.versions.node },
  ];
  const command = (name, binary, args, validate = () => true) => {
    const result = run(binary, args, {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
      // Windows package-manager shims are .cmd files; all arguments here are fixed.
      shell: platform === "win32" && binary === "pnpm.cmd",
    });
    // Only versions are printed. Never inspect credentials, environment or user profiles.
    const version = (result.stdout ?? "").trim().split("\n")[0];
    checks.push({
      name,
      ok: result.status === 0 && validate(version),
      detail: result.status === 0 ? version : "missing or unable to start",
    });
  };
  command(
    "pnpm",
    platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["--version"],
    (value) => value === "10.34.9",
  );
  command("Git", "git", ["--version"]);
  if (platform === "darwin") command("Swift", "xcrun", ["swiftc", "--version"]);
  if (platform === "linux") {
    command("make", "make", ["--version"]);
    command("C++ compiler", "c++", ["--version"]);
    command("Python", "python3", ["--version"]);
  }
  if (media) {
    command("FFmpeg", process.env.FFMPEG || "ffmpeg", ["-version"]);
    command("FFprobe", process.env.FFPROBE || "ffprobe", ["-version"]);
    command("yt-dlp", process.env.YT_DLP || "yt-dlp", ["--version"]);
  }
  return checks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const checks = doctor({ media: process.argv.includes("--media") });
  for (const check of checks)
    console.log(`${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.detail}`);
  if (checks.some((check) => !check.ok)) {
    console.error(
      "See README.md and docs/release-readiness.md for setup. No system settings were changed.",
    );
    process.exitCode = 1;
  }
}
