import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPrivateRuntimePath, publicSourceBytes } from "./public-source-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = new Set([
  "apps",
  "packages",
  "scripts",
  "docs",
  "examples",
  "patches",
  "tools",
  "video",
  ".github",
  ".agents",
]);
const rootFiles = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CHANGELOG.md",
  "LICENSE",
  "NOTICE",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "playwright.config.ts",
  "tsconfig.base.json",
  "eslint.config.mjs",
  ".gitignore",
  ".npmrc",
  ".env.example",
  ".prettierignore",
  ".prettierrc.json",
]);

export function isPublicSource(file) {
  if (isPrivateRuntimePath(file)) return false;
  const parts = file.split("/");
  const isProcessFixture = /^packages\/video-learn-process\/(?:examples|tree)\//.test(file);
  if (!(rootFiles.has(file) || roots.has(parts[0]))) return false;
  if (
    // These names identify output directories, not source files such as
    // release-artifacts.mjs or docs/release-readiness.md.
    parts
      .slice(0, -1)
      .some(
        (part) =>
          /^(?:node_modules|\.git|\.artifacts|\.lancer|\.lancer-task|\.next|test-results|playwright-report|release(?:-.*)?)$/.test(
            part,
          ) ||
          (part === "out" && !isProcessFixture),
      )
  )
    return false;
  return true;
}

export async function exportSource(destination) {
  const out = path.resolve(destination);
  if (out === root || root.startsWith(`${out}${path.sep}`))
    throw new Error("Destination must be a new folder, not the checkout or its parent.");
  // No overwrite, reset or deletion. Export working files, never .git/history or local artifacts.
  await mkdir(out, { recursive: false });
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, maxBuffer: 16 * 1024 * 1024 },
  )
    .toString()
    .split("\0")
    .filter(Boolean);
  const files = [];
  let excluded = 0;
  for (const file of [...new Set(listed)].sort()) {
    if (!isPublicSource(file)) {
      excluded++;
      continue;
    }
    const source = path.join(root, file);
    const stat = await lstat(source);
    const target = path.join(out, file);
    await mkdir(path.dirname(target), { recursive: true });
    if (stat.isSymbolicLink()) {
      const link = await readlink(source);
      const resolved = path.resolve(path.dirname(source), link);
      const relative = path.relative(root, resolved).split(path.sep).join("/");
      if (path.isAbsolute(link) || relative.startsWith("../") || !isPublicSource(relative))
        throw new Error(`Unsafe export symlink: ${file}`);
      await symlink(link, target);
      files.push({ path: file, link });
    } else if (stat.isFile()) {
      const data = publicSourceBytes(file, await readFile(source));
      await writeFile(target, data, { flag: "wx", mode: stat.mode & 0o777 });
      files.push({
        path: file,
        bytes: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      });
    } else throw new Error(`Unsupported source entry: ${file}`);
  }
  const manifest = {
    candidate: true,
    note: "Local source candidate. Asset rights and final release review are still required; this is not a secret-scan certification.",
    revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim(),
    exportedAt: new Date().toISOString(),
    excluded,
    files,
  };
  await writeFile(
    path.join(out, "PUBLIC-SOURCE-MANIFEST.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx" },
  );
  return {
    destination: out,
    files: files.length,
    excluded,
    bytes: files.reduce((sum, file) => sum + (file.bytes ?? 0), 0),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3)
    throw new Error("Usage: node scripts/export-source.mjs /absolute/new/folder");
  console.log(JSON.stringify(await exportSource(process.argv[2]), null, 2));
}
