import assert from "node:assert/strict";
import { test } from "node:test";
import semver from "semver";
import { approvedDependencyRange } from "./dependency-overrides.mjs";

const parent = { name: "@earendil-works/pi-coding-agent", version: "1.4.0" };
const overrides = { "undici@>=8 <8.12.3": "8.12.3" };

test("packaging requires the exact approved security backport, not the vulnerable pin", () => {
  const range = approvedDependencyRange(parent, "undici", "8.10.2", overrides);
  assert.equal(range, "8.12.3");
  assert.equal(semver.satisfies("8.12.3", range), true);
  assert.equal(semver.satisfies("8.10.2", range), false);
  assert.equal(semver.satisfies("8.13.0", range), false);
});

test("unrelated, broad, invalid or non-pinned overrides do not relax the requirement", () => {
  assert.equal(approvedDependencyRange(parent, "undici", "7.0.0", overrides), "7.0.0");
  assert.equal(approvedDependencyRange(parent, "undici", "*", overrides), "*");
  assert.equal(approvedDependencyRange(parent, "undici", "8.10.2", {}), "8.10.2");
  assert.equal(
    approvedDependencyRange(parent, "undici", "8.10.2", { undici: "^8.12.3" }),
    "8.10.2",
  );
  assert.equal(
    approvedDependencyRange(parent, "undici", "8.10.2", { "undici@invalid": "8.12.3" }),
    "8.10.2",
  );
});

test("parent-scoped overrides apply only to the intended consumer", () => {
  const scoped = { "@electron/rebuild>node-abi": "4.40.0" };
  assert.equal(
    approvedDependencyRange(
      { name: "@electron/rebuild", version: "4.0.4" },
      "node-abi",
      "^4.2.0",
      scoped,
    ),
    "4.40.0",
  );
  assert.equal(approvedDependencyRange(parent, "node-abi", "^4.2.0", scoped), "^4.2.0");
});
