import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [readme, contribution, site, page, build] = await Promise.all(
  [
    "README.md",
    "CONTRIBUTING.md",
    "apps/website/app/site.ts",
    "apps/website/app/page.tsx",
    "scripts/build-mac-lancer.sh",
  ].map((file) => readFile(path.join(root, file), "utf8")),
);
assert.match(readme, />=22\.19\.0 <26/);
assert.match(contribution, />=22\.19\.0 <26/);
assert.match(readme, /持久签名证书/);
assert.match(build, /run-electron-builder\.mjs/);
assert.doesNotMatch(readme, /identity: "-"|xattr -dr/);
assert.match(site, /SITE_NAME = "Lancer"/);
assert.match(site, /NEXT_PUBLIC_LANCER_GITHUB_URL/);
assert.match(site, /NEXT_PUBLIC_LANCER_RELEASES_AVAILABLE/);
assert.doesNotMatch(site, /export const GITHUB_URL = "https:\/\/github.com\/minghinmatthewlam/);
assert.doesNotMatch(page, /brew install --cask|brew upgrade --cask|Signed and notarized/);
assert.match(page, /Public downloads are not available yet/);
console.log("Lancer setup, signing and pending release links are aligned.");
