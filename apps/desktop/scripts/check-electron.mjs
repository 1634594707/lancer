import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Check before spawning watchers so an incomplete install does not leave a
// partially running development session. Do not bypass disabled install scripts.
function installedElectron() {
  const root = path.dirname(require.resolve("electron/package.json"));
  const relative = readFileSync(path.join(root, "path.txt"), "utf8").trim();
  return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(root, "dist"), relative);
}

export function checkElectron({ resolve = installedElectron, exists = existsSync } = {}) {
  try {
    const executable = resolve();
    if (typeof executable === "string" && exists(executable)) return;
  } catch {
    // Electron throws when its install script has not written path.txt.
  }
  throw new Error(
    "Electron 未完整安装。请先完成 pnpm install --frozen-lockfile；若安装脚本被跳过，" +
      "运行 pnpm run setup:electron 后重试。下载失败时检查网络及安装日志。",
  );
}
