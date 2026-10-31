import assert from "node:assert/strict";
import test from "node:test";
import { isPublicSource } from "./export-source.mjs";
import { doctor, supportedNode } from "./doctor.mjs";
import { checkElectron } from "../apps/desktop/scripts/check-electron.mjs";
import { publicSourceBytes } from "./public-source-policy.mjs";

test("public source excludes local history, signing keys and generated evidence", () => {
  for (const file of [
    ".lancer-task/out/recording.mp4",
    ".artifacts/log.json",
    ".git/config",
    ".claude/settings.json",
    "f1",
    "apps/desktop/release-local/a.app",
    "apps/desktop/out/main.js",
    "apps/desktop/auth.json",
    "apps/desktop/profile/models.json",
    "apps/desktop/profile/models.before-update.json",
    "packages/light-ui/demo/settings.json",
    "packages/light-ui/demo/.env.local",
    "apps/desktop/profile/catalogs.json",
    "apps/desktop/profile/doubao-app.json",
    "apps/desktop/profile/assistants.json",
    "apps/desktop/profile/ui-state.json",
    "apps/desktop/profile/credentials.yaml",
    "apps/desktop/profile/cookies.txt",
    "apps/desktop/profile/state.sqlite-wal",
    "apps/desktop/profile/transcript.jsonl",
    "apps/desktop/profile/debug.log",
    "apps/desktop/profile/Local Storage/state",
    "packages/light-ui/demo/.pi/agent/config.json",
    "packages/light-ui/.npmrc",
    "docs/id_ed25519",
    "apps/desktop/resources/.DS_Store",
    "apps/website/.env.local",
    ".env",
    ".env.local",
    "apps/desktop/.env.example",
    "docs/signing.p12",
  ])
    assert.equal(isPublicSource(file), false, file);
  for (const file of [
    "README.md",
    ".env.example",
    "CLAUDE.md",
    "apps/desktop/src/main.tsx",
    "packages/video-learn-process/PROCESS.json",
    "examples/desktop-extensions/pr-review/dist/main.js",
    "pnpm-lock.yaml",
    "apps/desktop/scripts/release-artifacts.mjs",
    "apps/desktop/scripts/release-artifacts.test.mjs",
    "apps/desktop/scripts/release-homepage.mjs",
    "scripts/release-readiness.test.mjs",
    "scripts/package-public-source.mjs",
    "apps/desktop/src/features/settings/settings-view.tsx",
    "apps/desktop/electron/doubao-app/binding-store.ts",
    "docs/release-readiness.md",
    "packages/video-learn-process/examples/demo_v001/remake/out/demo_v001/job.json",
    "packages/video-learn-process/tree/remake/out/.gitkeep",
  ])
    assert.equal(isPublicSource(file), true, file);
});
test("public package-manager settings never inherit private registries or auth", () => {
  const local = Buffer.from(
    "registry=https://registry.example.test\n_authToken=PRIVATE_TEST_VALUE\n",
  );
  assert.equal(publicSourceBytes(".npmrc", local).toString(), "node-linker=hoisted\n");
  assert.equal(publicSourceBytes("README.md", local), local);
});
test("doctor rejects unsupported Node and broken media executables", () => {
  for (const version of ["20.19.0", "22.18.0", "26.0.0"])
    assert.equal(supportedNode(version), false);
  for (const version of ["22.19.0", "24.0.0", "25.0.0"]) assert.equal(supportedNode(version), true);
  const checks = doctor({
    media: true,
    run: (bin) => ({
      status: bin.includes("ffmpeg") ? 1 : 0,
      stdout: bin.includes("pnpm") ? "10.34.9" : "version",
      stderr: "private environment detail",
    }),
  });
  assert.equal(checks.find((check) => check.name === "FFmpeg").ok, false);
  assert(!JSON.stringify(checks).includes("private environment detail"));
});

test("Linux setup reports missing native build tools without exposing stderr", () => {
  const checks = doctor({
    platform: "linux",
    run: (bin) => ({
      status: bin === "make" ? 1 : 0,
      stdout: bin === "pnpm" ? "10.34.9" : "version",
    }),
  });
  assert.equal(checks.find((check) => check.name === "make").ok, false);
  assert.equal(checks.find((check) => check.name === "C++ compiler").ok, true);
  assert.equal(checks.find((check) => check.name === "Python").ok, true);
});

test("Electron preflight detects absent and incomplete installs before launch", () => {
  assert.throws(
    () =>
      checkElectron({
        resolve: () => {
          throw new Error("missing path.txt");
        },
      }),
    /run setup:electron/,
  );
  assert.throws(
    () => checkElectron({ resolve: () => "/missing/electron", exists: () => false }),
    /run setup:electron/,
  );
  assert.doesNotThrow(() => checkElectron({ resolve: () => "/test/electron", exists: () => true }));
});
