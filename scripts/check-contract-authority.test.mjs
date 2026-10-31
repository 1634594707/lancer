import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkContractAuthority, checkContractDeclarations } from "./check-contract-authority.mjs";

for (const name of [
  "@lancer/session-driver",
  "@lancer/session-driver/runtime-types",
  "@lancer/catalogs",
  "@lancer/*",
  "@*",
  "*",
]) {
  test(`rejects ambient contract substitute ${name}`, () => {
    const failures = checkContractDeclarations(
      "vendor.d.ts",
      `declare module "${name}" { export interface SessionDriver {} }`,
    );
    assert.equal(failures.length, 1);
    assert.match(failures[0], /vendor\.d\.ts:1:.*canonical workspace exports/);
  });
}

test("rejects module augmentation as another owned contract path", () => {
  assert.equal(
    checkContractDeclarations(
      "augmentation.ts",
      'export {}; declare module "@lancer/session-driver" { interface SessionDriver { bypass(): void } }',
    ).length,
    1,
  );
});

test("accepts canonical definitions, imports, and unrelated external declarations", () => {
  assert.deepEqual(
    checkContractDeclarations(
      "types.ts",
      `
export interface SessionDriver { openSession(): void }
import type { SessionRef } from "@lancer/session-driver";
declare module "untyped-vendor" { export const value: unknown }
declare module "*.png" { const url: string; export default url }
// declare module "@lancer/catalogs" {}
`,
    ),
    [],
  );
});

test("repository guard rejects an untracked vendor declaration and accepts its replacement", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-gui-contract-guard-"));
  execFileSync("git", ["init", "--quiet", root]);
  const file = path.join(root, "packages/driver/src/vendor.d.ts");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    'declare module "@lancer/session-driver" { export interface SessionDriver {} }',
  );
  assert.equal(checkContractAuthority(root).length, 1);
  writeFileSync(file, 'import type { SessionDriver } from "@lancer/session-driver";');
  assert.deepEqual(checkContractAuthority(root), []);
});

for (const insideCheckout of [false, true]) {
  test(`source archives retain the contract guard (parent checkout: ${insideCheckout})`, () => {
    const parent = mkdtempSync(path.join(os.tmpdir(), "lancer-archive-guard-"));
    if (insideCheckout) execFileSync("git", ["init", "--quiet", parent]);
    const root = path.join(parent, "source");
    const file = path.join(root, "packages/driver/src/vendor.d.ts");
    const declaration = 'declare module "@lancer/session-driver" {}';
    for (const target of [
      file,
      path.join(root, "packages/driver/node_modules/vendor/index.d.ts"),
      path.join(root, "packages/driver/dist/vendor.d.ts"),
      path.join(root, "apps/desktop/out/vendor.d.ts"),
    ]) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, declaration);
    }
    assert.equal(checkContractAuthority(root).length, 1);
    writeFileSync(file, 'import type { SessionDriver } from "@lancer/session-driver";');
    assert.deepEqual(checkContractAuthority(root), []);
  });
}
