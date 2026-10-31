import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const evidence = path.join(root, ".artifacts", "marketing", `lancer-${Date.now()}`);
mkdirSync(evidence, { recursive: true });
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
execFileSync(pnpm, ["--filter", "@lancer/desktop", "build"], { cwd: root, stdio: "inherit" });
execFileSync(
  pnpm,
  [
    "exec",
    "playwright",
    "test",
    "-c",
    "apps/desktop/playwright.config.ts",
    "apps/desktop/tests/core/process-native-parity.spec.ts",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      PI_APP_REAL_AUTH: "0",
      PI_APP_TEST_MODE: "background",
      LANCER_NATIVE_OUTPUT: evidence,
    },
  },
);
const destination = path.join(root, "apps/website/public/media/lancer-workspace.webp");
execFileSync(
  process.env.FFMPEG_PATH || "ffmpeg",
  [
    "-y",
    "-i",
    path.join(evidence, "native-1480.png"),
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "88",
    destination,
  ],
  { stdio: "inherit" },
);
console.log(
  `Saved fixture-backed Lancer screenshot: ${destination}. Raw evidence retained: ${evidence}`,
);
