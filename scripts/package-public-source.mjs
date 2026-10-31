import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, readFile, readdir, readlink, realpath } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { create } from "tar";
import { isPrivateRuntimePath, publicSourceBytes } from "./public-source-policy.mjs";

const manifests = new Map([
  ["PUBLIC-SOURCE-MANIFEST.json", "lancer"],
  ["SOURCE-MANIFEST.json", "lancer-light-ui"],
]);

function safePath(file) {
  return (
    typeof file === "string" &&
    file.length > 0 &&
    !/^[A-Za-z]:|[\\\0]/.test(file) &&
    file.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

export async function packagePublicSource(directory, destination) {
  const source = await realpath(directory);
  const names = (await readdir(source)).filter((name) => manifests.has(name));
  if (names.length !== 1) throw new Error("Choose a pristine source export with one manifest.");
  const manifestName = names[0];
  const manifest = JSON.parse(await readFile(path.join(source, manifestName), "utf8"));
  if (!Array.isArray(manifest.files)) throw new Error("Invalid source manifest.");
  const expected = new Map();
  for (const entry of manifest.files) {
    if (!safePath(entry.path) || isPrivateRuntimePath(entry.path))
      throw new Error("Manifest contains a private or unsafe file path.");
    if (expected.has(entry.path) || entry.path === manifestName)
      throw new Error("Manifest contains duplicate entries.");
    expected.set(entry.path, entry);
  }
  const actual = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else actual.push(path.relative(source, full).split(path.sep).join("/"));
    }
  }
  await visit(source);
  if (
    actual.length !== expected.size + 1 ||
    actual.some((f) => f !== manifestName && !expected.has(f))
  )
    throw new Error(
      "Export has unlisted files. Create a fresh export; do not pack a working folder.",
    );
  for (const [file, entry] of expected) {
    const full = path.join(source, file);
    const stat = await lstat(full);
    if (stat.isSymbolicLink()) {
      const link = await readlink(full);
      const target = await realpath(full);
      if (
        link !== entry.link ||
        path.isAbsolute(link) ||
        !target.startsWith(`${source}${path.sep}`)
      )
        throw new Error("Export contains an unsafe or changed symbolic link.");
    } else {
      if (!stat.isFile()) throw new Error("Unsupported source entry.");
      const data = await readFile(full);
      if (!data.equals(publicSourceBytes(file, data)))
        throw new Error("Export contains private package-manager configuration.");
      if (createHash("sha256").update(data).digest("hex") !== entry.sha256)
        throw new Error("Export content differs from its manifest. Create a fresh export.");
    }
  }
  // Canonicalize the parent too: macOS /var and /private/var can name the same folder.
  const archive = path.join(
    await realpath(path.dirname(path.resolve(destination))),
    path.basename(destination),
  );
  if (archive === source || archive.startsWith(`${source}${path.sep}`))
    throw new Error("Write the archive outside the source export.");
  // Do not serialize the maintainer's account, file times, device IDs or inode data.
  // PAX stays enabled so long source paths remain intact; portable removes its host metadata.
  await pipeline(
    create(
      {
        cwd: source,
        prefix: manifests.get(manifestName),
        gzip: true,
        portable: true,
        noMtime: true,
        noDirRecurse: true,
        follow: false,
        strict: true,
      },
      [...expected.keys(), manifestName].sort(),
    ),
    createWriteStream(archive, { flags: "wx", mode: 0o600 }),
  );
  return { archive: path.basename(archive), files: expected.size, metadata: "anonymous" };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4)
    throw new Error(
      "Usage: node scripts/package-public-source.mjs SOURCE_EXPORT NEW_ARCHIVE.tar.gz",
    );
  console.log(JSON.stringify(await packagePublicSource(process.argv[2], process.argv[3]), null, 2));
}
