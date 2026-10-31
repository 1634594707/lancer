import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { extract, list } from "tar";
import { packagePublicSource } from "./package-public-source.mjs";

async function fixture(manifestName = "PUBLIC-SOURCE-MANIFEST.json") {
  const root = await mkdtemp(path.join(tmpdir(), "lancer-private-pack-"));
  const source = path.join(root, "personal-machine-folder");
  await mkdir(source);
  const files = ["README.md", `scripts/${"long-public-name-".repeat(10)}/run.sh`];
  const entries = [];
  for (const file of files) {
    const full = path.join(source, file);
    await mkdir(path.dirname(full), { recursive: true });
    const data = file.endsWith(".sh") ? "#!/bin/sh\nexit 0\n" : "Public source.\n";
    await writeFile(full, data);
    if (file.endsWith(".sh")) await chmod(full, 0o755);
    entries.push({ path: file, sha256: createHash("sha256").update(data).digest("hex") });
  }
  await writeFile(path.join(source, manifestName), JSON.stringify({ files: entries }));
  return { root, source, files, manifestName, archive: path.join(root, "source.tar.gz") };
}

test("both source packages round-trip without host identity or file timestamps", async () => {
  for (const [name, prefix] of [
    ["PUBLIC-SOURCE-MANIFEST.json", "lancer"],
    ["SOURCE-MANIFEST.json", "lancer-light-ui"],
  ]) {
    const f = await fixture(name);
    await packagePublicSource(f.source, f.archive);
    const entries = [];
    await list({
      file: f.archive,
      strict: true,
      onReadEntry: (entry) => {
        entries.push(entry.path);
        assert.equal(entry.uid ?? 0, 0);
        assert.equal(entry.gid ?? 0, 0);
        assert.equal(entry.uname ?? "", "");
        assert.equal(entry.gname ?? "", "");
        assert.equal(entry.mtime?.getTime() ?? 0, 0);
        assert.equal(entry.atime, undefined);
        assert.equal(entry.ctime, undefined);
        assert(!entry.path.includes("personal-machine-folder"));
      },
    });
    assert.deepEqual(entries.sort(), [...f.files, name].map((file) => `${prefix}/${file}`).sort());
    const target = path.join(f.root, "unpacked");
    await mkdir(target);
    await extract({ file: f.archive, cwd: target, strict: true });
    for (const file of f.files)
      assert.deepEqual(
        await readFile(path.join(target, prefix, file)),
        await readFile(path.join(f.source, file)),
      );
  }
});

test("packaging rejects changed, missing and extra files rather than silently shipping them", async () => {
  const changed = await fixture();
  await writeFile(path.join(changed.source, "README.md"), "Unreviewed content");
  await assert.rejects(
    packagePublicSource(changed.source, changed.archive),
    /differs from its manifest/,
  );
  const extra = await fixture();
  await writeFile(path.join(extra.source, "local-account.json"), "{}");
  await assert.rejects(packagePublicSource(extra.source, extra.archive), /unlisted files/);
  const missing = await fixture();
  const manifest = JSON.parse(
    await readFile(path.join(missing.source, missing.manifestName), "utf8"),
  );
  manifest.files.push({ path: "missing.txt", sha256: "0".repeat(64) });
  await writeFile(path.join(missing.source, missing.manifestName), JSON.stringify(manifest));
  await assert.rejects(packagePublicSource(missing.source, missing.archive), /unlisted files/);
});

test("a modified manifest cannot include private state or paths outside the export", async () => {
  for (const unsafe of [
    "../outside.txt",
    "/outside.txt",
    "C:/outside.txt",
    "a\\outside.txt",
    "auth.json",
    "demo/models.json",
    "demo/cookies.txt",
    ".pi/agent/state.json",
  ]) {
    const f = await fixture();
    await writeFile(
      path.join(f.source, f.manifestName),
      JSON.stringify({ files: [{ path: unsafe, sha256: "0".repeat(64) }] }),
    );
    await assert.rejects(packagePublicSource(f.source, f.archive), /private or unsafe/);
  }
});

test("packaging preserves existing archives and refuses output inside the export", async () => {
  const f = await fixture();
  await writeFile(f.archive, "Retained evidence");
  await assert.rejects(packagePublicSource(f.source, f.archive), { code: "EEXIST" });
  assert.equal(await readFile(f.archive, "utf8"), "Retained evidence");
  await assert.rejects(packagePublicSource(f.source, path.join(f.source, "new.tar.gz")), /outside/);
});

test("a matching manifest hash cannot authorize private package-manager credentials", async () => {
  const f = await fixture();
  const data = "_authToken=PRIVATE_TEST_VALUE\n";
  await writeFile(path.join(f.source, ".npmrc"), data);
  const manifestFile = path.join(f.source, f.manifestName);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  manifest.files.push({ path: ".npmrc", sha256: createHash("sha256").update(data).digest("hex") });
  await writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(packagePublicSource(f.source, f.archive), /private package-manager/);
});
