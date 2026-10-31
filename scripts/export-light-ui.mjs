import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPrivateRuntimePath } from "./public-source-policy.mjs";

const source = fileURLToPath(new URL("../packages/light-ui/", import.meta.url));
const destination = process.argv[2];
if (!destination || process.argv.length !== 3)
  throw new Error("Usage: node scripts/export-light-ui.mjs /absolute/new/repository");
const output = path.resolve(destination);
if (
  output === path.resolve(source) ||
  output.startsWith(`${path.resolve(source)}${path.sep}`) ||
  source.startsWith(`${output}${path.sep}`)
)
  throw new Error("Choose a new directory outside the package source.");
await mkdir(output, { recursive: false });
const entries = [
  "src",
  "test",
  "demo",
  "scripts",
  ".github",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.lint.json",
  "README.md",
  "PROMPT.md",
  "LICENSE",
  "NOTICE",
];
for (const entry of entries)
  await cp(path.join(source, entry), path.join(output, entry), {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (entryPath) => !isPrivateRuntimePath(path.relative(source, entryPath)),
  });
const files = [];
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (entry.isFile())
      files.push({
        path: path.relative(output, file).split(path.sep).join("/"),
        sha256: createHash("sha256")
          .update(await readFile(file))
          .digest("hex"),
      });
    else throw new Error(`Unexpected source entry: ${file}`);
  }
}
await visit(output);
await writeFile(
  path.join(output, "SOURCE-MANIFEST.json"),
  JSON.stringify(
    {
      source: "Lancer packages/light-ui",
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      directory: output,
      files: files.length,
      next: "npm install && npm run dev; initialize Git after reviewing the files",
    },
    null,
    2,
  ),
);
